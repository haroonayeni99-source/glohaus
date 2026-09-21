import { NextResponse, type NextRequest } from "next/server";
import { authConfigured } from "@/lib/config";
import { updateSession } from "@/lib/supabase/proxy";

export default async function proxy(request: NextRequest) {
  if (!authConfigured()) return NextResponse.next();
  return updateSession(request);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
