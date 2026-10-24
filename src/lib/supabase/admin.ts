import "server-only";
import { readPublicEnvironment } from "@/lib/public-runtime-config";
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const secret =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) return null;

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
