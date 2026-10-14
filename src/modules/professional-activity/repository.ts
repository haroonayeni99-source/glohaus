import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type { Account } from "@/modules/accounts/domain";
import type { ActivityOverview, MyActivity } from "./domain";

/** Optional telemetry must never block sign-in during a coordinated rollout. */
export async function recordProfessionalVisit(db: SqlClient, account: Account) {
  if (!account.professionalId || !account.roles.includes("professional"))
    return;
  await db.query("SAVEPOINT professional_activity");
  try {
    await db.query("SELECT beauty.record_my_professional_visit()");
    await db.query("RELEASE SAVEPOINT professional_activity");
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT professional_activity");
    await db.query("RELEASE SAVEPOINT professional_activity");
    console.warn("Professional activity tracking unavailable");
  }
}

export async function activityOverview(db: SqlClient, query = "", page = 0) {
  return (
    await db.query<{ data: ActivityOverview }>(
      "SELECT beauty.admin_professional_activity($1,$2) AS data",
      [query, page],
    )
  ).rows[0].data;
}

export async function myActivity(db: SqlClient) {
  return (
    await db.query<{ data: MyActivity }>(
      "SELECT beauty.my_professional_activity() AS data",
    )
  ).rows[0].data;
}

export type EngagementEmail = {
  id: string;
  email: string;
  subject: string;
  body: string;
  href: string;
  unsubscribe_token: string | null;
};

export function engagementEmail(job: EngagementEmail, origin: string) {
  const text = `${job.body}\n\nOpen GLOHAUS: ${new URL(job.href, origin).href}`;
  return {
    subject: job.subject,
    text: job.unsubscribe_token
      ? `${text}\n\nThis is optional GLOHAUS marketing. Unsubscribe: ${new URL(`/marketing/unsubscribe?token=${encodeURIComponent(job.unsubscribe_token)}`, origin).href}`
      : text,
  };
}
