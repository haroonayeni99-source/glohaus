import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { authConfigured } from "@/lib/config";

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Public pages can render before configuration; every private page/API also checks auth.
  if (!authConfigured()) return NextResponse.next();
  return clerkMiddleware({
    authorizedParties: [new URL(process.env.NEXT_PUBLIC_APP_URL!).origin],
  })(request, event);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
