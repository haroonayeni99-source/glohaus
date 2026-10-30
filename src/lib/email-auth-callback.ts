const productionHosts = new Set(["glohaus.shop", "www.glohaus.shop"]);

export function emailAuthCallbackUrl(currentUrl: string, next: string, isolatedPreview = false) {
  const current = new URL(currentUrl);
  // The server supplies this opt-in only after checking both isolated backends.
  const isolatedOrigin = isolatedPreview && current.protocol === "https:" &&
    current.hostname.endsWith(".vercel.app");
  const origin = productionHosts.has(current.hostname) || isolatedOrigin
    ? current.origin : "https://www.glohaus.shop";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}
