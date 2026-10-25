import type { SqlClient } from "@/modules/accounts/repository";
import type { SupportInput, SupportRequest } from "./domain";

export async function createSupportRequest(
  db: SqlClient,
  input: SupportInput,
  rateKey: string,
  tokenHash?: string,
) {
  const result = await db.query<{ id: string }>(
    "SELECT beauty.submit_support_request($1,$2,$3,$4,$5,$6) AS id",
    [
      input.name,
      input.email,
      input.topic,
      input.reference,
      input.message,
      rateKey,
    ],
  );
  const id = result.rows[0].id;
  if (tokenHash)
    await db.query("SELECT beauty.issue_support_access($1,$2,$3)", [
      id,
      rateKey,
      tokenHash,
    ]);
  return id;
}
export async function supportInbox(db: SqlClient): Promise<SupportRequest[]> {
  const result = await db.query<{ requests: SupportRequest[] }>(
    "SELECT beauty.admin_support_requests() AS requests",
  );
  return result.rows[0]?.requests ?? [];
}
export async function setSupportStatus(
  db: SqlClient,
  id: string,
  status:
    | "open"
    | "under_review"
    | "awaiting_customer"
    | "escalated"
    | "resolved"
    | "appealed",
) {
  await db.query("SELECT beauty.admin_set_support_status($1,$2)", [id, status]);
}
