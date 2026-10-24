import { requestOrigin } from "@/lib/request-origin";
const mainOrigin = "https://www.glohaus.shop";
const legacyHosts = new Set([
  "glohaus1.vercel.app",
  "glohaus1-haroon-glohaus.vercel.app",
  "glohaus1-git-main-haroon-glohaus.vercel.app",
]);

// Keep browser sessions on their initiating host. Known production aliases
// always return to the public domain; local and isolated previews stay local.
export function paymentReturnOrigin(request: Request): string {
  const url = new URL(requestOrigin(request));
  if (
    url.hostname === "glohaus.shop" ||
    url.hostname === "www.glohaus.shop" ||
    legacyHosts.has(url.hostname)
  )
    return mainOrigin;
  return url.origin;
}

export function bookingCancelPath(request: Request, bookingId: string): string {
  try {
    const referrer = new URL(request.headers.get("referer") || "");
    if (
      referrer.origin === requestOrigin(request) &&
      /^\/p\/[a-z0-9-]+$/.test(referrer.pathname)
    )
      return `${referrer.pathname}${referrer.search}#booking`;
  } catch {
    // A missing or invalid referrer uses the existing authenticated booking page.
  }
  return `/account/bookings/${bookingId}?checkout=cancelled`;
}

// Existing Stripe sessions keep their original URLs. Forward only known
// checkout-return GET routes on production aliases, preserving route/query.
export function legacyCheckoutReturn(request: Request): URL | null {
  const url = new URL(request.url);
  if (request.method !== "GET" || !legacyHosts.has(url.hostname)) return null;
  if (
    ![
      "/cart",
      "/account/orders",
      "/professional/plans",
      "/account/bookings",
    ].includes(url.pathname) &&
    !/^\/account\/bookings\/[0-9a-f-]{36}$/i.test(url.pathname)
  )
    return null;
  const target = new URL(url.pathname + url.search, mainOrigin);
  if (
    /^\/account\/bookings\/[0-9a-f-]{36}$/i.test(target.pathname) &&
    !target.searchParams.has("checkout")
  )
    target.searchParams.set("checkout", "returned");
  return target;
}

export function isCheckoutReturn(value: unknown): boolean {
  return value === "cancelled" || value === "returned";
}
