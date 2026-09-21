import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import {
  scheduleSchema,
  timeOffInterval,
  type TimeOffInput,
  type Rule,
} from "./domain";
export async function saveSchedule(
  db: SqlClient,
  professionalId: string,
  rules: Rule[],
) {
  scheduleSchema.parse({ rules });
  if (
    !(
      await db.query(
        "SELECT id FROM beauty.professional_profiles WHERE id=$1",
        [professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  await db.query(
    "DELETE FROM beauty.availability_rules WHERE professional_id=$1",
    [professionalId],
  );
  for (const rule of rules)
    await db.query(
      "INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,$2,$3,$4)",
      [professionalId, rule.weekday, rule.startMinute, rule.endMinute],
    );
}

export async function addTimeOff(
  db: SqlClient,
  professionalId: string,
  input: TimeOffInput,
) {
  const block = timeOffInterval(input);
  if (
    !(
      await db.query(
        "SELECT id FROM beauty.professional_profiles WHERE id=$1",
        [professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  const conflict = await db.query(
    `SELECT id FROM beauty.bookings WHERE professional_id=$1 AND starts_at<$3 AND ends_at>$2 AND (status='confirmed' OR (status='payment_pending' AND hold_expires_at>now())) LIMIT 1`,
    [professionalId, block.startsAt, block.endsAt],
  );
  if (conflict.rows.length) throw new AccessError("BOOKING_CONFLICT", 409);
  const result = await db.query<{ id: string }>(
    `INSERT INTO beauty.availability_blocks(professional_id,starts_at,ends_at,label) VALUES($1,$2,$3,$4) RETURNING id`,
    [professionalId, block.startsAt, block.endsAt, block.label],
  );
  return result.rows[0];
}
export async function removeTimeOff(
  db: SqlClient,
  professionalId: string,
  id: string,
) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  const result = await db.query(
    "DELETE FROM beauty.availability_blocks WHERE id=$1 AND professional_id=$2 RETURNING id",
    [id, professionalId],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
