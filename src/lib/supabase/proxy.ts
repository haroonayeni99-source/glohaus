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
          setAll: (items) => {
            items.forEach(({ name, value }) => request.cookies.set(name, value));
            response = noStore(NextResponse.next({ request }));
            items.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    await supabase.auth.getClaims();
  } catch {
    // A stale refresh token should not break a public page. The browser client
    // can recover its current session and protected routes fail closed.
    return noStore(NextResponse.next({ request }));
  }

  return response;
}
