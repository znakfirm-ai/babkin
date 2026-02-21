export function getReadableTextColor(hex: string): "#FFFFFF" | "#111111" {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return "#111111"
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 0.55 ? "#FFFFFF" : "#111111"
}
