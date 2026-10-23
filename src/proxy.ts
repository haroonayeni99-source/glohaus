import { readPublicEnvironment } from "@/lib/public-runtime-config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, publicSupabaseKey } from "@/lib/config";
import { updateSession } from "@/lib/supabase/proxy";
import { legacyCheckoutReturn } from "@/modules/payments/return-url";
import { contentSecurityPolicy } from "@/lib/content-security-policy";

const maintenanceExempt = [
  "/maintenance",
  "/admin",
  "/sign-in",
  "/auth/callback",
  "/security",
  "/api",
];

function isMaintenanceExempt(pathname: string) {
  // Crawlers still need the real discovery files while the Owner pauses the
  // public site. Never rewrite XML or robots.txt to an HTML maintenance page.
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return maintenanceExempt.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

async function publicSiteEnabled() {
  if (!authConfigured()) return true;
  try {
    const response = await fetch(
      `${readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/rpc/glohaus_public_site_enabled`,
      {
        method: "POST",
        headers: {
          apikey: publicSupabaseKey()!,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      },
    );
    if (!response.ok) return true;
    const enabled = await response.json();
    return enabled !== false;
  } catch {
    // Fail open if the status service is temporarily unavailable so an
    // infrastructure problem cannot accidentally take the public site down.
    return true;
  }
}

async function canBypassMaintenance(request: NextRequest) {
  if (!authConfigured()) return false;

  try {
    const supabase = createServerClient(
      readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")!,
      publicSupabaseKey()!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items) => {
            items.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
          },
        },
      },
    );

    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (claimsError || !claimsData?.claims?.sub) return false;

    const { data, error } = await supabase.rpc("glohaus_my_account");
    if (error || !data || typeof data !== "object") return false;

    const account = data as {
      status?: unknown;
      restrictedUntil?: unknown;
      deletedAt?: unknown;
      roles?: unknown;
    };

    if (account.status !== "active" || account.deletedAt) return false;

    if (
      typeof account.restrictedUntil === "string" &&
      Number.isFinite(Date.parse(account.restrictedUntil)) &&
      Date.parse(account.restrictedUntil) > Date.now()
    ) {
      return false;
    }

    const roles = Array.isArray(account.roles)
      ? account.roles.filter((role): role is string => typeof role === "string")
      : [];

    return roles.includes("owner") || roles.includes("admin");
  } catch {
    return false;
  }
}

function carrySessionCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of ["cache-control", "pragma", "expires"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}

function maintenanceResponse(request: NextRequest, session: NextResponse) {
  const maintenance = request.nextUrl.clone();
  maintenance.pathname = "/maintenance";
  maintenance.search = "";
  const response = carrySessionCookies(
    session,
    NextResponse.rewrite(maintenance, { status: 503 }),
  );
  // Temporary downtime must not look like a successful page with an instruction
  // to remove the original URL from Search. Prevent caching this paused state.
  response.headers.set("Retry-After", "3600");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function routeProxy(request: NextRequest) {
  const checkoutReturn = legacyCheckoutReturn(request);
  if (checkoutReturn) return NextResponse.redirect(checkoutReturn, 307);
  // Keep production auth on one hostname. Splitting Supabase session cookies
  // between the apex and www hosts creates hard-to-reproduce SSR sessions.
  if (request.nextUrl.hostname === "glohaus.shop") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "www.glohaus.shop";
    return NextResponse.redirect(canonical, 308);
  }

  const sessionResponse = authConfigured()
    ? await updateSession(request)
    : NextResponse.next({ request });

  if (request.nextUrl.pathname === "/maintenance") {
    return maintenanceResponse(request, sessionResponse);
  }

  if (!isMaintenanceExempt(request.nextUrl.pathname)) {
    const enabled = await publicSiteEnabled();

    if (!enabled) {
      const privileged = await canBypassMaintenance(request);
      if (privileged) return sessionResponse;

      return maintenanceResponse(request, sessionResponse);
    }
  }

  return sessionResponse;
}

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Webhooks and API bodies retain their existing processing and signatures.
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(path))
    return routeProxy(request);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", request.nextUrl.protocol === "https:");
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const response = await routeProxy(request);
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|mjs|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
