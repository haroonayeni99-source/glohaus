import "server-only";
import { after } from "next/server";
import { withPaymentWorker } from "@/modules/payments/worker";
import { withIdentity } from "@/lib/db";
import { encryptionReady } from "./secrets";
import { syncProfessional } from "./repository";
import { AccessError } from "@/modules/accounts/domain";
export async function runBusinessToolsWorker() {
  if (!encryptionReady()) return { configured: false };
  const owners = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{ auth_id: string; professional_id: string }>(
          "SELECT * FROM beauty.due_business_connections()",
        )
      ).rows,
  );
  const started = Date.now();
  let synced = 0,
    failed = 0;
  for (const owner of owners) {
    if (Date.now() - started > 20000) break;
    const result = await syncProfessional(
      owner.auth_id,
      owner.professional_id,
      undefined,
      false,
      1,
    );
    synced += result.synced;
    failed += result.failed;
  }
  return { configured: true, synced, failed };
}
export function scheduleBusinessToolsSync() {
  if (!encryptionReady()) return;
  try {
    after(async () => {
      try {
        await runBusinessToolsWorker();
      } catch {
        console.warn("Business tools sync deferred to scheduled retry");
      }
    });
  } catch {
    /* Durable next_sync_at remains the retry source. */
  }
}
export async function refreshServiceCalendars(
  serviceId: string,
  immediate = false,
) {
  if (!encryptionReady()) return;
  const owner = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{
          auth_id: string;
          professional_id: string;
          refresh_started_at: Date;
        }>(
          "SELECT *,clock_timestamp() AS refresh_started_at FROM beauty.service_calendar_owner($1)",
          [serviceId],
        )
      ).rows[0],
  );
  if (!owner) return;
  await syncProfessional(
    owner.auth_id,
    owner.professional_id,
    undefined,
    immediate,
    8,
    true, // Availability must not wait for unrelated social portfolio refreshes.
  );
  if (immediate) {
    const stale = await withIdentity(
      owner.auth_id,
      async (db) =>
        (
          await db.query(
            "SELECT id FROM beauty.business_connections WHERE professional_id=$1 AND provider IN('google','outlook','ics') AND status<>'disconnected' AND (status<>'connected' OR last_success_at IS NULL OR last_success_at<$2::timestamptz) LIMIT 1",
            [owner.professional_id, owner.refresh_started_at],
          )
        ).rows.length,
    );
    if (stale) throw new AccessError("UNAVAILABLE", 503);
  }
}
