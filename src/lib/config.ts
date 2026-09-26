const fallbackSupabaseUrl = "https://tyycrmmczsgnowditnii.supabase.co";
const fallbackPublishableKey = "sb_publishable_-GwHOM6mpnvKK_d-qP1kyA_1pn7-nc3";

export function publicSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackSupabaseUrl;
}

export function publicSupabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    fallbackPublishableKey
  );
}

function validSupabaseUrl(): boolean {
  try {
    const url = new URL(publicSupabaseUrl());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function authConfigured(): boolean {
  return Boolean(validSupabaseUrl() && publicSupabaseKey());
}

export function accountsConfigured(): boolean {
  return authConfigured() && Boolean(process.env.DATABASE_URL);
}
