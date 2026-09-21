import "server-only";
import { AccessError, type Identity } from "@/modules/accounts/domain";
import { authConfigured } from "./config";
import { createClient } from "@/lib/supabase/server";

export async function getIdentity(): Promise<Identity> {
  if (!authConfigured()) throw new AccessError("UNAVAILABLE", 503);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const authId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (error || !authId || !email) throw new AccessError("UNAUTHENTICATED", 401);
  return {
    authId,
    email,
    displayName: email.split("@")[0]?.slice(0, 120) || "Your account",
    secondFactorAge: null,
  };
}
