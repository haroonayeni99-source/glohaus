export function safeReturnTo(
  value: string | null | undefined,
  fallback = "/workspace",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    // URL parsers strip tabs/newlines before resolving a redirect. Reject
    // controls before that can turn an apparently relative path into //host.
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return fallback;
  return value;
}
