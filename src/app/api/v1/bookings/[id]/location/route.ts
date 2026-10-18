import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const updateSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      sessionToken: z.uuid(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyM: z.number().int().min(0).max(5000),
      observedAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);

type Row = {
  sharing: boolean;
  session_nonce: string;
  owner_session: boolean;
  started_at: Date;
  stopped_at: Date | null;
  expires_at: Date;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy_m: number | null;
  last_observed_at: Date | null;
  booking_status: string;
  feature_enabled?: boolean;
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
    row.feature_enabled !== false &&
    row.sharing &&
    row.last_observed_at !== null &&
    Date.now() - new Date(row.last_observed_at).getTime() <= 90000 &&
    Date.now() < new Date(row.expires_at).getTime() &&
    row.booking_status === "confirmed";

  return {
    sharing:
      row.feature_enabled !== false &&
      row.sharing &&
      new Date(row.expires_at).getTime() > Date.now() &&
      row.booking_status === "confirmed",
    sessionToken: row.owner_session ? row.session_nonce : null,
    active,
    startedAt: new Date(row.started_at).toISOString(),
    stoppedAt: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    latitude: active ? row.last_latitude : null,
    longitude: active ? row.last_longitude : null,
    accuracyM: active ? row.last_accuracy_m : null,
    observedAt:
      active && row.last_observed_at
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
      `SELECT session.sharing,session.session_nonce,(session.customer_id=(SELECT id FROM beauty.users WHERE auth_id=beauty.auth_id())) AS owner_session,session.started_at,session.stopped_at,session.expires_at,
              session.last_latitude,session.last_longitude,session.last_accuracy_m,
              session.last_observed_at,booking.status AS booking_status,settings.journey_sharing AS feature_enabled
       FROM beauty.booking_location_sessions session
       JOIN beauty.bookings booking ON booking.id=session.booking_id
       CROSS JOIN beauty.arrival_settings settings
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
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      if (!account.roles.includes("customer"))
        throw new AccessError("FORBIDDEN", 403);

      if (parsed.data.action === "stop") {
        await db.query(
          `UPDATE beauty.booking_location_sessions session
           SET sharing=false,session_nonce=gen_random_uuid(),stopped_at=now(),updated_at=now(),last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL
           WHERE session.booking_id=$1
             AND session.customer_id=$2`,
          [id, account.id],
        );
        return locationRow(db, id);
      }

      if (parsed.data.action === "start") {
        const started = await db.query(
          `INSERT INTO beauty.booking_location_sessions(booking_id,customer_id,professional_id,sharing,expires_at,session_nonce)
          SELECT b.id,b.customer_id,b.professional_id,true,b.ends_at,gen_random_uuid() FROM beauty.bookings b CROSS JOIN beauty.arrival_settings settings
          WHERE b.id=$1 AND b.customer_id=$2 AND settings.journey_sharing AND b.status='confirmed' AND now() BETWEEN b.starts_at-interval '3 hours' AND b.ends_at
          ON CONFLICT(booking_id) DO UPDATE SET sharing=true,started_at=now(),stopped_at=NULL,expires_at=excluded.expires_at,session_nonce=excluded.session_nonce,last_latitude=NULL,last_longitude=NULL,last_accuracy_m=NULL,last_observed_at=NULL,updated_at=now() RETURNING booking_id`,
          [id, account.id],
        );
        if (!started.rows.length) throw new AccessError("UNAVAILABLE", 409);
        return locationRow(db, id);
      }
      const observedAt = new Date(parsed.data.observedAt);
      const drift = Math.abs(Date.now() - observedAt.getTime());
      if (drift > 60000) throw new AccessError("INVALID_REQUEST", 400);
      const result = await db.query(
        `UPDATE beauty.booking_location_sessions session SET
        last_latitude=$2,last_longitude=$3,last_accuracy_m=$4,last_observed_at=$5,updated_at=now()
        FROM beauty.bookings booking CROSS JOIN beauty.arrival_settings settings
        WHERE session.booking_id=$1 AND booking.id=session.booking_id AND session.customer_id=$6 AND settings.journey_sharing
        AND session.session_nonce=$7::uuid AND session.sharing AND session.expires_at>now() AND booking.status='confirmed'
        AND now() BETWEEN booking.starts_at-interval '3 hours' AND booking.ends_at
        AND (session.last_observed_at IS NULL OR (session.last_observed_at<$5::timestamptz AND session.updated_at<now()-interval '10 seconds'))
        RETURNING session.booking_id`,
        [
          id,
          parsed.data.latitude,
          parsed.data.longitude,
          parsed.data.accuracyM,
          observedAt,
          account.id,
          parsed.data.sessionToken,
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
