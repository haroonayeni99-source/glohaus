import "server-only";
import { createHash } from "node:crypto";
import type { SqlClient } from "@/modules/accounts/repository";
import type {
  ConnectionStatus,
  Provider,
  SocialPost,
  PublicSocialPost,
} from "./domain";
import { seal, unseal } from "./secrets";
import { freshTokens, providerReady, type Tokens } from "./oauth";
import { calendarBusy, exportBooking, type ExportBooking } from "./calendars";
import { socialPosts } from "./social";
import { renewWatch } from "./watch";
import { withIdentity } from "@/lib/db";
export async function businessTools(db: SqlClient, professionalId: string) {
  const connections = (
    await db.query<ConnectionStatus>(
      "SELECT id,provider,label,status,auto_publish,export_bookings,last_success_at,last_error,social_mode,sync_enabled FROM beauty.business_connections WHERE professional_id=$1 ORDER BY created_at",
      [professionalId],
    )
  ).rows;
  const posts = (
    await db.query<SocialPost>(
      "SELECT id,platform,original_url,caption,source_created_at,service_id,publication_status,sort_order,featured,source_available,media_type FROM beauty.social_portfolio WHERE professional_id=$1 ORDER BY featured DESC,sort_order,source_created_at DESC NULLS LAST,created_at DESC LIMIT 200",
      [professionalId],
    )
  ).rows;
  const preferences = (
    await db.query<{ buffer_minutes: number; travel_buffer_minutes: number }>(
      "SELECT buffer_minutes,travel_buffer_minutes FROM beauty.calendar_preferences WHERE professional_id=$1",
      [professionalId],
    )
  ).rows[0] || { buffer_minutes: 0, travel_buffer_minutes: 0 };
  const portfolio = (
    await db.query<{
      max_visible_posts: number;
      instagram_url: string;
      tiktok_url: string;
      sync_allowed: boolean;
    }>(
      "SELECT coalesce(s.max_visible_posts,12)::integer AS max_visible_posts,p.instagram_url,p.tiktok_url,beauty.social_sync_allowed(p.id) AS sync_allowed FROM beauty.professional_profiles p LEFT JOIN beauty.social_portfolio_preferences s ON s.professional_id=p.id WHERE p.id=$1",
      [professionalId],
    )
  ).rows[0];
  return { connections, posts, preferences, portfolio };
}
export async function publicSocialPosts(
  db: SqlClient,
  professionalId?: string,
  categoryId?: string,
) {
  const posts = (
    await db.query<PublicSocialPost>(
      `SELECT s.* FROM (SELECT p.*,row_number() OVER(PARTITION BY p.professional_id ORDER BY p.featured DESC,p.sort_order,p.source_created_at DESC NULLS LAST,p.id) AS preview_position FROM beauty.public_social_portfolio p) s WHERE ($1::uuid IS NULL OR s.professional_id=$1) AND ($1::uuid IS NOT NULL OR s.preview_position<=3) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM beauty.public_professional_specialities p WHERE p.professional_id=s.professional_id AND p.category_id=$2)) ORDER BY s.featured DESC,s.sort_order,s.source_created_at DESC NULLS LAST,s.id LIMIT 80`,
      [professionalId || null, categoryId || null],
    )
  ).rows;
  return posts.map((post) => ({
    ...post,
    source_created_at: post.source_created_at
      ? new Date(post.source_created_at).toISOString()
      : null,
  }));
}
export async function storeConnection(
  db: SqlClient,
  professionalId: string,
  provider: Provider,
  label: string,
  tokens: Tokens,
  writeCalendar = false,
) {
  const ciphertext = seal(tokens, `${professionalId}:${provider}`);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  const count = await db.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM beauty.business_connections WHERE professional_id=$1 AND NOT(provider=$2 AND label=$3)",
    [professionalId, provider, label],
  );
  if (count.rows[0].count >= 8) throw Error("TOO_MANY_CONNECTIONS");
  // Reconnecting replaces credentials on the same logical connection, retaining event mappings.
  return (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.business_connections(professional_id,provider,label,secret_ciphertext,export_bookings) VALUES($1,$2,$3,$4,$5) ON CONFLICT(professional_id,provider,label) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,status='pending',last_error=NULL,next_sync_at=now(),lease_until=NULL,export_bookings=EXCLUDED.export_bookings RETURNING id`,
      [professionalId, provider, label, ciphertext, writeCalendar],
    )
  ).rows[0];
}
export async function syncProfessional(
  authId: string,
  professionalId: string,
  connectionId?: string,
  force = false,
  limit = 5,
) {
  const candidates = await withIdentity(
    authId,
    async (db) =>
      (
        await db.query<{ id: string }>(
          `SELECT id FROM beauty.business_connections WHERE professional_id=$1 AND status<>'disconnected' AND ($2::uuid IS NULL OR id=$2) AND (lease_until IS NULL OR lease_until<now()) AND (NOT $3::boolean OR provider IN('google','outlook','ics')) AND ($3::boolean OR $2::uuid IS NOT NULL OR next_sync_at<=now()) AND (provider IN('google','outlook','ics') OR (beauty.social_sync_allowed(professional_id) AND ($2::uuid IS NOT NULL OR (sync_enabled AND social_mode<>'manual' AND coalesce(last_error,'')<>'RECONNECT_REQUIRED')))) ORDER BY CASE WHEN provider IN('google','outlook','ics') THEN 0 ELSE 1 END,next_sync_at LIMIT $4`,
          [professionalId, connectionId || null, force, limit],
        )
      ).rows,
  );
  const outcomes: boolean[] = [];
  for (const { id } of candidates) {
    const lease = await withIdentity(
      authId,
      async (db) =>
        (
          await db.query<ConnectionStatus & { secret_ciphertext: string }>(
            `UPDATE beauty.business_connections SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND professional_id=$2 AND status<>'disconnected' AND (lease_until IS NULL OR lease_until<now()) AND (provider IN('google','outlook','ics') OR beauty.social_sync_allowed(professional_id)) RETURNING *`,
            [id, professionalId],
          )
        ).rows[0],
    );
    if (!lease) continue;
    const originalCipher = lease.secret_ciphertext;
    let currentCipher = originalCipher;
    try {
      if (
        ["instagram", "tiktok"].includes(lease.provider) &&
        !providerReady(lease.provider)
      ) {
        await withIdentity(authId, (db) =>
          db.query(
            "UPDATE beauty.business_connections SET lease_until=NULL,next_sync_at=now()+interval '1 hour' WHERE id=$1 AND secret_ciphertext=$2",
            [id, originalCipher],
          ),
        );
        continue;
      }
      let tokens = await freshTokens(
        lease.provider,
        unseal<Tokens>(
          lease.secret_ciphertext,
          `${professionalId}:${lease.provider}`,
        ),
      );
      tokens = await renewWatch(
        lease.provider,
        tokens,
        authId,
        professionalId,
        id,
      );
      // Persist rotated refresh tokens before any subsequent provider call can fail.
      const tokenCipher = seal(tokens, `${professionalId}:${lease.provider}`);
      const stillCurrent = await withIdentity(
        authId,
        async (db) =>
          (
            await db.query(
              "UPDATE beauty.business_connections SET secret_ciphertext=$2 WHERE id=$1 AND secret_ciphertext=$3 AND status<>'disconnected' RETURNING id",
              [id, tokenCipher, originalCipher],
            )
          ).rows.length > 0,
      );
      if (!stillCurrent) continue;
      currentCipher = tokenCipher;
      if (["google", "outlook", "ics"].includes(lease.provider)) {
        const exports = await withIdentity(
          authId,
          async (db) =>
            (
              await db.query<{
                booking_id: string;
                event_id: string;
                fingerprint: string;
              }>(
                "SELECT booking_id,event_id,fingerprint FROM beauty.calendar_exports WHERE connection_id=$1",
                [id],
              )
            ).rows,
        );
        if (lease.export_bookings && lease.provider !== "ics") {
          const bookings = await withIdentity(
            authId,
            async (db) =>
              (
                await db.query<ExportBooking>(
                  `SELECT id,starts_at,ends_at,status FROM beauty.bookings WHERE professional_id=$1 AND ((status='confirmed' AND ends_at>now()-interval '1 day' AND starts_at<now()+interval '92 days') OR id IN(SELECT booking_id FROM beauty.calendar_exports WHERE connection_id=$2)) ORDER BY starts_at LIMIT 1000`,
                  [professionalId, id],
                )
              ).rows,
          );
          let changes = 0;
          for (const booking of bookings) {
            const existing = exports.find((e) => e.booking_id === booking.id);
            const fingerprint = createHash("sha256")
              .update(
                `${booking.status}:${new Date(booking.starts_at).toISOString()}:${new Date(booking.ends_at).toISOString()}`,
              )
              .digest("hex");
            if (existing?.fingerprint === fingerprint) continue;
            if (++changes > 15) throw Error("SYNC_FAILED"); // Bound each worker run; completed mappings make retries incremental.
            const eventId = await exportBooking(
              lease.provider,
              tokens,
              booking,
              existing?.event_id,
            );
            await withIdentity(authId, async (db) => {
              if (eventId)
                await db.query(
                  "INSERT INTO beauty.calendar_exports(connection_id,booking_id,event_id,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(connection_id,booking_id) DO UPDATE SET event_id=EXCLUDED.event_id,fingerprint=EXCLUDED.fingerprint",
                  [id, booking.id, eventId, fingerprint],
                );
              else
                await db.query(
                  "DELETE FROM beauty.calendar_exports WHERE connection_id=$1 AND booking_id=$2",
                  [id, booking.id],
                );
            });
          }
        }
        const currentExports = await withIdentity(
          authId,
          async (db) =>
            (
              await db.query<{ event_id: string }>(
                "SELECT event_id FROM beauty.calendar_exports WHERE connection_id=$1",
                [id],
              )
            ).rows,
        );
        const from = new Date(Date.now() - 86400000).toISOString(),
          to = new Date(Date.now() + 92 * 86400000).toISOString();
        const busy = await calendarBusy(
          lease.provider,
          tokens,
          from,
          to,
          new Set(currentExports.map((e) => e.event_id)),
        );
        if (
          busy.length > 10000 ||
          busy.some(
            (b) =>
              !b.key ||
              !Number.isFinite(Date.parse(b.start)) ||
              !Number.isFinite(Date.parse(b.end)) ||
              Date.parse(b.end) <= Date.parse(b.start),
          )
        )
          throw Error("SYNC_FAILED");
        const applied = await withIdentity(authId, async (db) => {
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [professionalId],
          );
          const current = (
            await db.query(
              "SELECT id FROM beauty.business_connections WHERE id=$1 AND status<>'disconnected' AND secret_ciphertext=$2 FOR UPDATE",
              [id, tokenCipher],
            )
          ).rows.length;
          if (!current) return false;
          await db.query(
            "DELETE FROM beauty.external_calendar_busy WHERE connection_id=$1",
            [id],
          );
          await db.query(
            `INSERT INTO beauty.external_calendar_busy(connection_id,professional_id,event_key,starts_at,ends_at) SELECT $1,$2,x.key,x."start"::timestamptz,x."end"::timestamptz FROM jsonb_to_recordset($3::jsonb) AS x(key text,"start" text,"end" text) ON CONFLICT(connection_id,event_key) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at`,
            [id, professionalId, JSON.stringify(busy)],
          );
          await db.query(
            "UPDATE beauty.business_connections SET status='connected',last_success_at=now(),last_error=NULL,successes=successes+1,lease_until=NULL,next_sync_at=now()+interval '2 minutes' WHERE id=$1",
            [id],
          );
          return true;
        });
        if (!applied) continue;
      } else {
        const posts = await socialPosts(lease.provider, tokens);
        const applied = await withIdentity(authId, async (db) => {
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended('glohaus-social-sync',0))",
          );
          const current = (
            await db.query<{
              id: string;
              auto_publish: boolean;
              social_mode: string;
              sync_enabled: boolean;
            }>(
              "SELECT id,auto_publish,social_mode,sync_enabled FROM beauty.business_connections WHERE id=$1 AND status<>'disconnected' AND secret_ciphertext=$2 AND beauty.social_sync_allowed(professional_id) FOR UPDATE",
              [id, tokenCipher],
            )
          ).rows[0];
          if (!current) return false;
          if (
            !connectionId &&
            (!current.sync_enabled || current.social_mode === "manual")
          ) {
            await db.query(
              "UPDATE beauty.business_connections SET lease_until=NULL WHERE id=$1",
              [id],
            );
            return false;
          }
          for (const post of posts)
            await db.query(
              `INSERT INTO beauty.social_portfolio(professional_id,connection_id,platform,external_id,original_url,caption,source_created_at,publication_status,media_type,thumbnail_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(professional_id,platform,external_id) DO UPDATE SET original_url=EXCLUDED.original_url,caption=EXCLUDED.caption,source_created_at=EXCLUDED.source_created_at,connection_id=EXCLUDED.connection_id,media_type=EXCLUDED.media_type,thumbnail_url=EXCLUDED.thumbnail_url,source_available=true,publication_status=CASE WHEN beauty.social_portfolio.publication_status='unavailable' THEN 'draft' ELSE beauty.social_portfolio.publication_status END`,
              [
                professionalId,
                id,
                post.platform,
                post.externalId,
                post.url,
                post.caption,
                post.createdAt,
                current.auto_publish ? "published" : "draft",
                post.mediaType,
                post.thumbnailUrl,
              ],
            );
          await db.query(
            "UPDATE beauty.social_portfolio SET source_available=false,thumbnail_url='' WHERE connection_id=$1 AND NOT(external_id=ANY($2::text[]))",
            [id, posts.map((p) => p.externalId)],
          );
          await db.query(
            "UPDATE beauty.business_connections SET status='connected',last_success_at=now(),last_error=NULL,successes=successes+1,lease_until=NULL,next_sync_at=now()+interval '1 hour' WHERE id=$1",
            [id],
          );
          return true;
        });
        if (!applied) continue;
      }
      outcomes.push(true);
    } catch (error) {
      const code =
        error instanceof Error &&
        ["RECONNECT_REQUIRED", "FEED_UNSUPPORTED", "NOT_CONFIGURED"].includes(
          error.message,
        )
          ? error.message
          : "SYNC_FAILED";
      await withIdentity(authId, (db) =>
        db.query(
          "UPDATE beauty.business_connections SET status='error',last_error=$2,failures=failures+1,lease_until=NULL,next_sync_at=now()+CASE WHEN provider IN('google','outlook','ics') THEN interval '5 minutes' WHEN $2='RECONNECT_REQUIRED' THEN interval '1 day' ELSE interval '15 minutes'*power(2,least(failures,4)) END WHERE id=$1 AND status<>'disconnected' AND secret_ciphertext=$3",
          [id, code, currentCipher],
        ),
      );
      outcomes.push(false);
    }
  }
  return {
    synced: outcomes.filter(Boolean).length,
    failed: outcomes.filter((x) => !x).length,
  };
}
