import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseKey } from "@/lib/config";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = noStore(NextResponse.next({ request }));
  // Public routes must remain available if Supabase is temporarily unreachable.
  // Protected handlers still verify auth again server-side.
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      publicSupabaseKey()!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items, headers) => {
            items.forEach(({ name, value }) => request.cookies.set(name, value));
            response = noStore(NextResponse.next({ request }));
            items.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value),
            );
          },
        },
      },
    );

    await supabase.auth.getClaims();
  } catch {
    // If @supabase/ssr cannot decode a chunked auth cookie, returning the same
    // broken chunks causes every later server request to fail the same way.
    // Expire only this project's auth cookies so the next password/OTP sign-in
    // starts from a clean browser/server session.
    const clean = noStore(NextResponse.next({ request }));
    let projectRef = "";
    try {
      projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname.split(".")[0] || "";
    } catch {}
    const prefix = projectRef ? `sb-${projectRef}-auth-token` : "";
    if (prefix) {
      for (const cookie of request.cookies.getAll()) {
        if (!cookie.name.startsWith(prefix)) continue;
        clean.cookies.set(cookie.name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          sameSite: "lax",
        });
      }
    }
    return clean;
  }

  return response;
}
