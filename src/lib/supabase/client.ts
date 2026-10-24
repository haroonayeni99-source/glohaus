"use client";
import { readPublicEnvironment } from "@/lib/public-runtime-config";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseKey } from "@/lib/config";

export function createClient() {
  return createBrowserClient(
    readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")!,
    publicSupabaseKey()!,
  );
}
