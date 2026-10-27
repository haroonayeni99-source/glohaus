import { cookies } from "next/headers";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  providerSchema,
  preferencesSchema,
} from "@/modules/business-tools/domain";
import { beginOAuth, providerReady } from "@/modules/business-tools/oauth";
import { feedUrl } from "@/modules/business-tools/ics";
import {
  storeConnection,
  syncProfessional,
} from "@/modules/business-tools/repository";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("connect"),
      provider: providerSchema,
      consent: z.literal(true),
      writeCalendar: z.boolean().default(false),
      url: z.string().max(2048).optional(),
      label: z.string().trim().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("preferences"), ...preferencesSchema.shape })
    .strict(),
  z.object({ action: z.enum(["disconnect", "sync"]), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("displayMode"),
      id: z.uuid(),
      automatic: z.boolean(),
    })
    .strict(),
]);
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 6000));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;
    const account = await withAccount("professional", async (_db, a) => a);
    const professionalId = account.professionalId!;
    if (input.action === "connect") {
      if (!providerReady(input.provider))
        return json({ error: { code: "NOT_CONFIGURED" } }, 409);
      if (input.provider === "ics") {
        let url: string;
        try {
          url = feedUrl(input.url || "").toString();
        } catch {
          throw new AccessError("INVALID_REQUEST", 400);
        }
        const connection = await withAccount("professional", (db) =>
          storeConnection(
            db,
            professionalId,
            "ics",
            input.label || "Subscribed calendar",
            { accessToken: "", expiresAt: 0, feedUrl: url },
          ),
        );
        const result = await syncProfessional(
          account.authId,
          professionalId,
          connection.id,
        );
        return json({ ...result, saved: true });
      }
      const flow = beginOAuth(
        input.provider,
        account.authId,
        professionalId,
        ["google", "outlook"].includes(input.provider) && input.writeCalendar,
      );
      (await cookies()).set(
        `glohaus_connection_${input.provider}`,
        flow.cookie,
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/api/v1/professional/connections",
          maxAge: 600,
        },
      );
      return json({ url: flow.url });
    }
    if (input.action === "preferences") {
      await withAccount("professional", async (db) => {
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          professionalId,
        ]);
        await db.query(
          "INSERT INTO beauty.calendar_preferences(professional_id,buffer_minutes,travel_buffer_minutes) VALUES($1,$2,$3) ON CONFLICT(professional_id) DO UPDATE SET buffer_minutes=EXCLUDED.buffer_minutes,travel_buffer_minutes=EXCLUDED.travel_buffer_minutes",
          [professionalId, input.bufferMinutes, input.travelBufferMinutes],
        );
      });
      return json({ saved: true });
    }
    if (input.action === "sync") {
      const owned = await withAccount(
        "professional",
        async (db) =>
          (
            await db.query(
              "SELECT id FROM beauty.business_connections WHERE id=$1 AND professional_id=$2",
              [input.id, professionalId],
            )
          ).rows.length,
      );
      if (!owned) throw new AccessError("FORBIDDEN", 403);
      return json(
        await syncProfessional(account.authId, professionalId, input.id),
      );
    }
    await withAccount("professional", async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        professionalId,
      ]);
      if (input.action === "displayMode") {
        const changed = await db.query(
          "UPDATE beauty.business_connections SET auto_publish=$3 WHERE id=$1 AND professional_id=$2 AND provider IN('instagram','tiktok') AND status<>'disconnected' RETURNING id",
          [input.id, professionalId, input.automatic],
        );
        if (!changed.rows.length) throw new AccessError("FORBIDDEN", 403);
      } else {
        const changed = await db.query(
          "UPDATE beauty.business_connections SET status='disconnected',secret_ciphertext='',lease_until=NULL,last_error=NULL WHERE id=$1 AND professional_id=$2 RETURNING id",
          [input.id, professionalId],
        );
        if (!changed.rows.length) throw new AccessError("FORBIDDEN", 403);
        await db.query(
          "DELETE FROM beauty.external_calendar_busy WHERE connection_id=$1",
          [input.id],
        );
        await db.query(
          "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE connection_id=$1",
          [input.id],
        );
      }
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
