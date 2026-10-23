import { readPublicEnvironment } from "@/lib/public-runtime-config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseKey } from "@/lib/config";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function clearProjectAuthCookies(request: NextRequest) {
  const clean = noStore(NextResponse.next({ request }));
  let projectRef = "";
  try {
    projectRef =
      new URL(readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL") || "").hostname.split(
        ".",
      )[0] || "";
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

export async function updateSession(request: NextRequest) {
  let response = noStore(NextResponse.next({ request }));
  // Public routes must remain available if Supabase is temporarily unreachable.
  // Protected handlers still verify auth again server-side.
  try {
    const supabase = createServerClient(
      readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")!,
      publicSupabaseKey()!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items, headers) => {
            items.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
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

    const { error } = await supabase.auth.getClaims();
    // Supabase persists refreshed/revoked sessions through setAll. Only discard
    // cookies for a definitive invalid session; network/5xx failures are retryable.
    if (
      error &&
      ["refresh_token_not_found", "session_not_found", "bad_jwt"].includes(
        error.code ?? "",
      )
    )
      return clearProjectAuthCookies(request);
  } catch (error) {
    // Malformed cookie data can be discarded. A connection failure must leave
    // valid refresh cookies intact so the next request can recover.
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "Invalid UTF-8 sequence")
    )
      return clearProjectAuthCookies(request);
  }

  return response;
}
