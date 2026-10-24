import { readPublicEnvironment } from "@/lib/public-runtime-config";
export function publicSupabaseKey(): string | undefined {
  return (
    readPublicEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    readPublicEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

function validSupabaseUrl(): boolean {
  const value = readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function authConfigured(): boolean {
  return Boolean(
    validSupabaseUrl() &&
    publicSupabaseKey(),
  );
}
export function accountsConfigured(): boolean {
  return authConfigured() && Boolean(process.env.DATABASE_URL);
}
