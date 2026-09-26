import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseKey, publicSupabaseUrl } from "@/lib/config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // A public route must remain available if the provider is temporarily
  // unreachable or its public configuration is invalid. Protected handlers
  // verify claims again and reject the request server-side.
  try {
    const supabase = createServerClient(publicSupabaseUrl(), publicSupabaseKey()!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
      },
    });
    await supabase.auth.getClaims();
  } catch {
    return NextResponse.next({ request });
  }
  return response;
}
