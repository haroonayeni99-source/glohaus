import { readPublicEnvironment } from "./public-runtime-config";

// Vercel's container proxy can give Next.js an internal listening URL. Only
// deployment configuration may translate that URL back to a public origin;
// neither Origin nor an arbitrary forwarded host is an authority.
export function requestOrigin(request: Request): string {
  const incoming = new URL(request.url);
  if (
    process.env.VERCEL_ENV === "development" ||
    (!process.env.VERCEL && !process.env.VERCEL_ENV)
  )
    return incoming.origin;

  const origins: URL[] = [];
  const configured = [
    readPublicEnvironment("NEXT_PUBLIC_APP_URL"),
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .filter(Boolean)
      .map((host) => `https://${host}`),
  ];
  for (const value of configured) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password)
        origins.push(url);
    } catch {
      /* Missing/invalid deployment configuration fails closed below. */
    }
  }

  for (const host of [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    incoming.host,
  ]) {
    const match = origins.find(
      (url) =>
        host === url.host || (!url.port && host === `${url.hostname}:443`),
    );
    if (match) return match.origin;
  }
  return origins[0]?.origin ?? incoming.origin;
}
