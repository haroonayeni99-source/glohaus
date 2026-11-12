const productionHosts = new Set(["glohaus.shop", "www.glohaus.shop"]);

// The server enables this only after validating both isolated backends.
export function emailAuthCallbackUrl(currentUrl: string, next: string, isolatedPreview = false) {
  const current = new URL(currentUrl);
  const isolatedOrigin = isolatedPreview && current.protocol === "https:" &&
    current.hostname.endsWith(".vercel.app");
  const origin = productionHosts.has(current.hostname) || isolatedOrigin
    ? current.origin : "https://www.glohaus.shop";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}
