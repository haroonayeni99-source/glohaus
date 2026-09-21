"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseKey } from "@/lib/config";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publicSupabaseKey()!,
  );
}
