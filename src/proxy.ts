import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, publicSupabaseKey } from "@/lib/config";
import { updateSession } from "@/lib/supabase/proxy";

const maintenanceExempt = [
  "/maintenance",
  "/admin",
  "/sign-in",
  "/auth/callback",
  "/security",
  "/api",
];

function isMaintenanceExempt(pathname: string) {
  return maintenanceExempt.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

async function publicSiteEnabled() {
  if (!authConfigured()) return true;
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/glohaus_public_site_enabled`,
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
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      publicSupabaseKey()!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items) => {
            items.forEach(({ name, value }) => request.cookies.set(name, value));
          },
        },
      },
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
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

export default async function proxy(request: NextRequest) {
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

  if (!isMaintenanceExempt(request.nextUrl.pathname)) {
    const enabled = await publicSiteEnabled();

    if (!enabled) {
      const privileged = await canBypassMaintenance(request);
      if (privileged) return sessionResponse;

      const maintenance = request.nextUrl.clone();
      maintenance.pathname = "/maintenance";
      maintenance.search = "";
      return carrySessionCookies(
        sessionResponse,
        NextResponse.rewrite(maintenance),
      );
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
