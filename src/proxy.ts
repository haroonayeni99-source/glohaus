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

export default async function proxy(request: NextRequest) {
  // Keep production auth on one hostname. Splitting Supabase session cookies
  // between the apex and www hosts creates hard-to-reproduce SSR sessions.
  if (request.nextUrl.hostname === "glohaus.shop") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "www.glohaus.shop";
    return NextResponse.redirect(canonical, 308);
  }

  if (!isMaintenanceExempt(request.nextUrl.pathname)) {
    const enabled = await publicSiteEnabled();
    if (!enabled) {
      const maintenance = request.nextUrl.clone();
      maintenance.pathname = "/maintenance";
      maintenance.search = "";
      return NextResponse.rewrite(maintenance);
    }
  }

  if (!authConfigured()) return NextResponse.next();
  return updateSession(request);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
