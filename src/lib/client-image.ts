const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024;
const TARGET_BYTES = 900 * 1024;
const PRIMARY_MAX_DIMENSION = 1024;
const FALLBACK_MAX_DIMENSION = 768;
const PASSTHROUGH_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ClientImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientImageError";
  }
}

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";

    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      reject(new ClientImageError("Không thể đọc ảnh này. Hãy chọn một ảnh khác."));
    };

    image.onload = () => {
      if (settled) return;
      settled = true;
      resolve({ image, objectUrl });
    };
    image.onerror = fail;
    image.src = objectUrl;

    // decode() is useful on modern browsers, but onload remains the compatibility
    // path for Safari/iOS versions with inconsistent decode() behavior.
    if (typeof image.decode === "function") {
      void image.decode().catch(() => {
        // onload/onerror will settle the promise.
      });
    }
  });
}

function scaledSize(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg",
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function outputFile(blob: Blob, source: File, extension: "webp" | "jpg") {
  const base = source.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "avatar";
  return new File([blob], `${base}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

async function renderCanvas(
  image: HTMLImageElement,
  maxDimension: number,
) {
  const size = scaledSize(image.naturalWidth, image.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.width = 1;
    canvas.height = 1;
    throw new ClientImageError("Thiết bị không thể xử lý ảnh lúc này.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

async function encodeWebp(canvas: HTMLCanvasElement) {
  const qualities = [0.82, 0.74, 0.68];
  let smallest: Blob | null = null;

  for (const quality of qualities) {
    const blob = await canvasBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") return null;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= TARGET_BYTES) return blob;
  }

  return smallest;
}

async function encodeJpeg(canvas: HTMLCanvasElement) {
  // JPEG has no alpha channel. Paint a neutral white background rather than
  // allowing transparent pixels to turn black on some browsers.
  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = canvas.width;
  jpegCanvas.height = canvas.height;
  const context = jpegCanvas.getContext("2d", { alpha: false });
  if (!context) {
    jpegCanvas.width = 1;
    jpegCanvas.height = 1;
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  context.drawImage(canvas, 0, 0);

  const qualities = [0.82, 0.74, 0.68];
  let smallest: Blob | null = null;
  try {
    for (const quality of qualities) {
      const blob = await canvasBlob(jpegCanvas, "image/jpeg", quality);
      if (!blob || blob.type !== "image/jpeg") continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
    return smallest;
  } finally {
    jpegCanvas.width = 1;
    jpegCanvas.height = 1;
  }
}

async function encodeCanvas(canvas: HTMLCanvasElement) {
  const webp = await encodeWebp(canvas);
  if (webp) return { blob: webp, extension: "webp" as const };

  const jpeg = await encodeJpeg(canvas);
  if (jpeg) return { blob: jpeg, extension: "jpg" as const };

  throw new ClientImageError("Trình duyệt không thể tạo ảnh avatar từ file đã chọn.");
}

export async function optimizeAvatarFile(file: File) {
  if (!file.size) throw new ClientImageError("Ảnh được chọn đang rỗng.");
  if (file.size > MAX_INPUT_BYTES) {
    throw new ClientImageError("Ảnh gốc quá lớn. Vui lòng chọn ảnh nhỏ hơn 20 MB.");
  }

  const { image, objectUrl } = await loadImage(file);
  let canvas: HTMLCanvasElement | null = null;

  try {
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new ClientImageError("Không xác định được kích thước ảnh.");
    }

    // Small, already-supported images do not need a lossy second encode.
    if (
      file.size <= TARGET_BYTES
      && Math.max(image.naturalWidth, image.naturalHeight) <= PRIMARY_MAX_DIMENSION
      && PASSTHROUGH_TYPES.has(file.type)
    ) {
      return file;
    }

    canvas = await renderCanvas(image, PRIMARY_MAX_DIMENSION);
    let encoded = await encodeCanvas(canvas);

    if (encoded.blob.size > TARGET_BYTES && Math.max(canvas.width, canvas.height) > FALLBACK_MAX_DIMENSION) {
      canvas.width = 1;
      canvas.height = 1;
      canvas = await renderCanvas(image, FALLBACK_MAX_DIMENSION);
      encoded = await encodeCanvas(canvas);
    }

    if (encoded.blob.size > MAX_OUTPUT_BYTES) {
      throw new ClientImageError("Không thể tối ưu ảnh xuống dung lượng an toàn. Hãy chọn ảnh khác.");
    }

    return outputFile(encoded.blob, file, encoded.extension);
  } catch (error) {
    if (error instanceof ClientImageError) throw error;
    throw new ClientImageError("Không thể xử lý ảnh trên thiết bị này. Hãy thử ảnh khác.");
  } finally {
    URL.revokeObjectURL(objectUrl);
    image.onload = null;
    image.onerror = null;
    image.src = "";
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
