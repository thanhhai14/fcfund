import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clubs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { kind } = await params;
  if (kind !== "logo" && kind !== "qr") {
    return new Response("Not found", { status: 404 });
  }

  const [club] = await db
    .select({ logoUrl: clubs.logoUrl, qrUrl: clubs.qrUrl })
    .from(clubs)
    .where(eq(clubs.id, user.clubId))
    .limit(1);
  const blobUrl = kind === "logo" ? club?.logoUrl : club?.qrUrl;
  if (!blobUrl) return new Response("Not found", { status: 404 });

  try {
    const access = blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(blobUrl, {
      access,
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });
    if (!result) return new Response("Not found", { status: 404 });
    if (result.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: { ETag: result.blob.etag },
      });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Length": String(result.blob.size),
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600, must-revalidate",
        ETag: result.blob.etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[club-assets] Blob read failed", {
      kind,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown Blob error",
    });
    return new Response("Không thể tải ảnh", { status: 502 });
  }
}
