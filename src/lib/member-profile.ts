export const PREFERRED_FOOT_LABELS: Record<string, string> = {
  RIGHT: "Chân phải",
  LEFT: "Chân trái",
  BOTH: "Hai chân",
};

export function preferredFootLabel(value: string | null | undefined, fallback = "Chưa cập nhật") {
  if (!value) return fallback;
  return PREFERRED_FOOT_LABELS[value.toUpperCase()] ?? value;
}
