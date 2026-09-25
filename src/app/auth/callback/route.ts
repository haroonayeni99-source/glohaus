import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseKey } from "@/lib/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";
  const response = NextResponse.redirect(new URL(target, url.origin));
  response.headers.set("Cache-Control", "private, no-store");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publicSupabaseKey()!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) =>
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  );

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/sign-in?authError=missing_code", url.origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error)
    return NextResponse.redirect(new URL("/sign-in?authError=confirmation_failed", url.origin));

  return response;
}
