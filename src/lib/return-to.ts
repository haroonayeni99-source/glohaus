export function safeReturnTo(
  value: string | null | undefined,
  fallback = "/workspace",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return fallback;
  return value;
}
