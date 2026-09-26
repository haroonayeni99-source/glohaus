import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().int().min(0).max(5000),
    observedAt: z.iso.datetime({ offset: true }),
  }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);

type Row = {
  sharing: boolean;
  started_at: Date;
  stopped_at: Date | null;
  expires_at: Date;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy_m: number | null;
  last_observed_at: Date | null;
  booking_status: string;
};

function present(row?: Row) {
  if (!row)
    return {
      sharing: false,
      active: false,
      startedAt: null,
      stoppedAt: null,
      expiresAt: null,
      latitude: null,
      longitude: null,
      accuracyM: null,
      observedAt: null,
    };

  const active =
    row.sharing &&
    row.last_observed_at !== null &&
    Date.now() - new Date(row.last_observed_at).getTime() <= 90000 &&
    Date.now() < new Date(row.expires_at).getTime() &&
    row.booking_status === "confirmed";

  return {
    sharing: row.sharing,
    active,
    startedAt: new Date(row.started_at).toISOString(),
    stoppedAt: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    latitude: row.last_latitude,
    longitude: row.last_longitude,
    accuracyM: row.last_accuracy_m,
    observedAt: row.last_observed_at
      ? new Date(row.last_observed_at).toISOString()
      : null,
  };
}

async function locationRow(
  db: import("@/modules/accounts/repository").SqlClient,
  id: string,
) {
  return (
    await db.query<Row>(
      `SELECT session.sharing,session.started_at,session.stopped_at,session.expires_at,
              session.last_latitude,session.last_longitude,session.last_accuracy_m,
              session.last_observed_at,booking.status AS booking_status
       FROM beauty.booking_location_sessions session
       JOIN beauty.bookings booking ON booking.id=session.booking_id
       WHERE session.booking_id=$1`,
      [id],
    )
  ).rows[0];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const identity = await getIdentity();
    const data = await withIdentity(identity.authId, async (db) => {
      authorize(await findAccount(db, identity.authId), identity);
      return locationRow(db, id);
    });
    return json(present(data));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await smallJson(request, 4096));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const data = await withIdentity(identity.authId, async (db) => {
      const account = authorize(await findAccount(db, identity.authId), identity);
      if (!account.roles.includes("customer"))
        throw new AccessError("FORBIDDEN", 403);

      if (parsed.data.action === "stop") {
        await db.query(
          `UPDATE beauty.booking_location_sessions session
           SET sharing=false,stopped_at=now(),updated_at=now()
           WHERE session.booking_id=$1
             AND session.customer_id=$2`,
          [id, account.id],
        );
        return locationRow(db, id);
      }

      const observedAt = new Date(parsed.data.observedAt);
      const drift = Math.abs(Date.now() - observedAt.getTime());
      if (drift > 120000) throw new AccessError("INVALID_REQUEST", 400);

      const result = await db.query(
        `INSERT INTO beauty.booking_location_sessions(
           booking_id,customer_id,professional_id,sharing,started_at,stopped_at,
           expires_at,last_latitude,last_longitude,last_accuracy_m,last_observed_at,updated_at
         )
         SELECT booking.id,booking.customer_id,booking.professional_id,true,now(),null,
                booking.ends_at,$2,$3,$4,$5,now()
         FROM beauty.bookings booking
         WHERE booking.id=$1
           AND booking.customer_id=$6
           AND booking.status='confirmed'
           AND now() BETWEEN booking.starts_at-interval '3 hours' AND booking.ends_at
         ON CONFLICT(booking_id) DO UPDATE SET
           sharing=true,
           stopped_at=null,
           expires_at=excluded.expires_at,
           last_latitude=excluded.last_latitude,
           last_longitude=excluded.last_longitude,
           last_accuracy_m=excluded.last_accuracy_m,
           last_observed_at=excluded.last_observed_at,
           updated_at=now()
         RETURNING booking_id`,
        [
          id,
          parsed.data.latitude,
          parsed.data.longitude,
          parsed.data.accuracyM,
          observedAt,
          account.id,
        ],
      );

      if (!result.rows.length) throw new AccessError("UNAVAILABLE", 409);
      return locationRow(db, id);
    });

    return json(present(data));
  } catch (error) {
    return apiError(error);
  }
}
