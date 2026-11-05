import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { configuration } from "./oauth";
import { unseal } from "./secrets";
import type { Tokens } from "./oauth";

// Run inside the caller's identity transaction. Capture credentials before erasing
// them, and commit the local disconnect before contacting an external provider.
export async function disconnectConnection(
  db: SqlClient,
  professionalId: string,
  id: string,
) {
  const row = (
    await db.query<{ provider: string; secret_ciphertext: string }>(
      `WITH owned AS (
      SELECT id,provider,secret_ciphertext FROM beauty.business_connections
      WHERE id=$1 AND professional_id=$2 FOR UPDATE
    ) UPDATE beauty.business_connections c
      SET status='disconnected',secret_ciphertext='',lease_until=NULL,last_error=NULL
      FROM owned WHERE c.id=owned.id
      RETURNING owned.provider,owned.secret_ciphertext`,
      [id, professionalId],
    )
  ).rows[0];
  if (!row) throw new AccessError("FORBIDDEN", 403);
  await db.query(
    "DELETE FROM beauty.external_calendar_busy WHERE connection_id=$1",
    [id],
  );
  await db.query(
    "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE connection_id=$1",
    [id],
  );
  return row;
}

export async function revokeDisconnectedTikTok(
  professionalId: string,
  ciphertext: string,
) {
  try {
    const tokens = unseal<Tokens>(ciphertext, `${professionalId}:tiktok`);
    const config =
      tokens.tiktokApp === "sandbox"
        ? {
            clientId: process.env.TIKTOK_SANDBOX_CLIENT_ID || "",
            secret: process.env.TIKTOK_SANDBOX_CLIENT_SECRET || "",
          }
        : configuration("tiktok");
    if (!tokens.accessToken || !config.clientId || !config.secret) return false;
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/revoke/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: config.clientId,
          client_secret: config.secret,
          token: tokens.accessToken,
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return false;
    // TikTok documents an empty body or {} on success, and an error object
    // on failure. Never return provider payloads or credentials to the client.
    const body = await response.text();
    if (!body.trim()) return true;
    return !JSON.parse(body).error;
  } catch {
    return false;
  }
}
