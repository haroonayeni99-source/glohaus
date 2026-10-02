import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AccessError, type Account, type Role } from "@/modules/accounts/domain";

type RpcAccount = {
  id: string;
  authId: string;
  email: string;
  displayName: string;
  status: Account["status"];
  roles: Role[];
  professionalId: string | null;
};

function normalizeAccount(data: unknown): Account | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<RpcAccount>;
  if (
    typeof row.id !== "string" ||
    typeof row.authId !== "string" ||
    typeof row.email !== "string" ||
    typeof row.displayName !== "string" ||
    !Array.isArray(row.roles)
  ) return null;
  return {
    id: row.id,
    authId: row.authId,
    email: row.email,
    displayName: row.displayName,
    status:
      row.status === "suspended" || row.status === "removed"
        ? row.status
        : "active",
    roles: row.roles.filter(
      (role): role is Role =>
        role === "customer" ||
        role === "professional" ||
        role === "staff" ||
        role === "admin" ||
        role === "owner",
    ),
    professionalId:
      typeof row.professionalId === "string" ? row.professionalId : null,
  };
}

export function accountDatabaseUnavailable(error: unknown) {
  if (error instanceof AccessError && error.code === "UNAVAILABLE") return true;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    code.startsWith("08") ||
    ["28000", "28P01", "53300", "57P01", "57P02", "57P03"].includes(code)
  ) return true;

  // The runtime database role can authenticate successfully while still
  // missing a grant on one of the private application tables. Treat that as a
  // runtime-database outage for account reads/writes so the authenticated
  // Supabase RPC path can complete the request instead of trapping a signed-in
  // user on the auth form.
  if (
    code === "42501" &&
    /permission denied for (table|schema|sequence|function)/i.test(message)
  ) return true;

  return /PAM authentication failed|password authentication failed|too many connections|connection terminated|server closed the connection/i.test(
    message,
  );
}

export async function supabaseAccount(): Promise<Account | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("glohaus_my_account");
  if (error) throw error;
  return normalizeAccount(data);
}

export async function supabaseEnrolAccount(
  role: "customer" | "professional",
  options?: {
    adultConfirmed?: boolean;
    professionalTermsAccepted?: boolean;
  },
): Promise<Account> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("glohaus_enrol_self", {
    next_role: role,
    adult_confirmed: options?.adultConfirmed ?? false,
    professional_terms_accepted:
      options?.professionalTermsAccepted ?? false,
  });
  if (error) {
    if (error.code === "42501") throw new AccessError("FORBIDDEN", 403);
    if (error.code === "22023") throw new AccessError("INVALID_REQUEST", 400);
    throw error;
  }
  const account = normalizeAccount(data);
  if (!account) throw new AccessError("UNAVAILABLE", 503);
  return account;
}
