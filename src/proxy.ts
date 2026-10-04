import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, publicSupabaseKey } from "@/lib/config";
import { updateSession } from "@/lib/supabase/proxy";

function routeAlwaysAvailable(pathname: string) {
  return (
    pathname === "/closed" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api")
  );
}

async function publicSiteOpen(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicSupabaseKey();
  if (!url || !key) return true;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/glohaus_public_site_open`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) return true;
    const value = await response.json();
    return value !== false;
  } catch {
    // Availability control fails open if the status service is unreachable,
    // preventing an infrastructure outage from permanently locking out visitors.
    return true;
  }
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!routeAlwaysAvailable(pathname) && !(await publicSiteOpen())) {
    const closedUrl = request.nextUrl.clone();
    closedUrl.pathname = "/closed";
    closedUrl.search = "";
    return NextResponse.redirect(closedUrl);
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
