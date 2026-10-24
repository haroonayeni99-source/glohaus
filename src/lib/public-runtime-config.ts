// Public browser configuration only. Secrets must never be added to this list.
// Container builds do not receive project environment variables; render this
// allowlist from the server runtime rather than freezing empty values at build.
export const publicEnvironmentNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_CARTO_BASEMAPS_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;
type PublicEnvironmentName = (typeof publicEnvironmentNames)[number];
function runtimeValue(name: PublicEnvironmentName): string | undefined {
  return process.env[name];
}
export function publicRuntimeConfiguration(): Partial<
  Record<PublicEnvironmentName, string>
> {
  return Object.fromEntries(
    publicEnvironmentNames.flatMap((name) => {
      const value = runtimeValue(name);
      return value ? [[name, value]] : [];
    }),
  );
}
export function readPublicEnvironment(
  name: PublicEnvironmentName,
): string | undefined {
  if (!publicEnvironmentNames.includes(name)) return undefined;
  if (typeof document !== "undefined") {
    const element = document.getElementById("glohaus-public-configuration");
    if (element) {
      try {
        const config = JSON.parse(element.textContent || "{}");
        if (typeof config[name] === "string") return config[name] || undefined;
      } catch {
        /* Framework/local fixtures can still use their build configuration. */
      }
    }
  } else return runtimeValue(name);
  // Keep the native Next.js and local fixture path compatible. Only these
  // explicit public variables may be inlined into a browser bundle.
  switch (name) {
    case "NEXT_PUBLIC_SUPABASE_URL":
      return process.env.NEXT_PUBLIC_SUPABASE_URL;
    case "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    case "NEXT_PUBLIC_SUPABASE_ANON_KEY":
      return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    case "NEXT_PUBLIC_CARTO_BASEMAPS_KEY":
      return process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY;
    case "NEXT_PUBLIC_APP_URL":
      return process.env.NEXT_PUBLIC_APP_URL;
  }
}
export function serializePublicRuntimeConfiguration() {
  return JSON.stringify(publicRuntimeConfiguration())
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
