import { NextResponse, type NextRequest } from "next/server";
import { authConfigured } from "@/lib/config";
import { updateSession } from "@/lib/supabase/proxy";

export default async function proxy(request: NextRequest) {
  // Keep production auth on one hostname. Splitting Supabase session cookies
  // between the apex and www hosts creates hard-to-reproduce SSR sessions.
  if (request.nextUrl.hostname === "glohaus.shop") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "www.glohaus.shop";
    return NextResponse.redirect(canonical, 308);
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
