import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseKey, publicSupabaseUrl } from "@/lib/config";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    publicSupabaseUrl(),
    publicSupabaseKey()!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => {
      try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Proxy persists refreshed cookies. */ }
    } } },
  );
}
