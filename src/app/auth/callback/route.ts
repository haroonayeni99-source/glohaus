import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseKey } from "@/lib/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL(url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/onboarding", url.origin));
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publicSupabaseKey()!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const code = url.searchParams.get("code");
  if (code) await supabase.auth.exchangeCodeForSession(code);
  return response;
}
