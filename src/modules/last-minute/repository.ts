import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import { appointmentSlots, type Rule } from "@/modules/availability/domain";
import { calendarDate } from "@/modules/availability/calendar";
import { lastMinuteInputSchema, type LastMinuteInput } from "./domain";

export async function createLastMinuteSlot(
  db: SqlClient,
  professionalId: string,
  input: LastMinuteInput,
) {
  const parsed = lastMinuteInputSchema.parse(input);
  const startMs = Date.parse(parsed.startsAt);
  const now = Date.now();
  if (
    !Number.isFinite(startMs) ||
    startMs <= now ||
    startMs > now + 7 * 86400000
  ) {
    throw new AccessError("INVALID_REQUEST", 400);
  }

  const service = (
    await db.query<{ id: string; duration_minutes: number }>(
      `SELECT id,duration_minutes
       FROM beauty.services
       WHERE id=$1 AND professional_id=$2 AND active=true`,
      [parsed.serviceId, professionalId],
    )
  ).rows[0];
  if (!service) throw new AccessError("FORBIDDEN", 403);

  const date = calendarDate(startMs);
  const rules = (
    await db.query<Rule>(
      `SELECT weekday,start_minute AS "startMinute",end_minute AS "endMinute"
       FROM beauty.availability_rules
       WHERE professional_id=$1`,
      [professionalId],
    )
  ).rows;

  const dayStart = Date.parse(`${date}T00:00:00Z`) - 7200000;
  const busy = (
    await db.query<{ starts_at: Date; ends_at: Date }>(
      "SELECT * FROM beauty.booking_busy($1,$2,$3)",
      [
        professionalId,
        new Date(dayStart).toISOString(),
        new Date(dayStart + 28 * 3600000).toISOString(),
      ],
    )
  ).rows.map((row) => ({
    start: new Date(row.starts_at).getTime(),
    end: new Date(row.ends_at).getTime(),
  }));

  const validSlots = appointmentSlots(
    date,
    service.duration_minutes,
    rules,
    busy,
    now,
  );
  if (!validSlots.includes(new Date(startMs).toISOString()))
    throw new AccessError("BOOKING_CONFLICT", 409);

  const endMs = startMs + service.duration_minutes * 60000;
  const expiresMs = Math.min(startMs, now + 24 * 3600000);

  await db.query(
    `UPDATE beauty.last_minute_slots
     SET status='withdrawn'
     WHERE professional_id=$1
       AND status='active'
       AND starts_at=$2`,
    [professionalId, new Date(startMs).toISOString()],
  );

  const result = await db.query<{ id: string }>(
    `INSERT INTO beauty.last_minute_slots
      (professional_id,service_id,starts_at,ends_at,caption,expires_at)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      professionalId,
      parsed.serviceId,
      new Date(startMs).toISOString(),
      new Date(endMs).toISOString(),
      parsed.caption,
      new Date(expiresMs).toISOString(),
    ],
  );
  return result.rows[0];
}

export async function withdrawLastMinuteSlot(
  db: SqlClient,
  professionalId: string,
  id: string,
) {
  const result = await db.query(
    `UPDATE beauty.last_minute_slots
     SET status='withdrawn'
     WHERE id=$1 AND professional_id=$2 AND status='active'
     RETURNING id`,
    [id, professionalId],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
