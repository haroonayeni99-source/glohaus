import { z } from "zod";
import { withAdmin, withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
const config = z
  .object({
    smartArrival: z.boolean(),
    journeyPlanner: z.boolean(),
    journeySharing: z.boolean(),
    departureReminders: z.boolean(),
    radiusM: z.number().int().min(50).max(200),
    defaultBuffer: z.number().int().min(0).max(120),
    schedulerReady: z.boolean().optional(),
  })
  .strict();
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("resend"),
      notificationId: z.uuid(),
      reason: z.string().trim().min(10).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("settings"),
      config,
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("correction"),
      bookingId: z.uuid(),
      reason: z.string().trim().min(10).max(1000),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("bookingId");
    if (id && !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    return json(
      await withAdmin(
        async (db) =>
          (
            await db.query<{ data: unknown }>(
              "SELECT beauty.admin_arrival_overview($1) AS data",
              [id],
            )
          ).rows[0].data,
      ),
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ARRIVAL_SCHEDULER_NOT_READY")
      return json(
        {
          error: {
            code: "ARRIVAL_SCHEDULER_NOT_READY",
            message:
              "The one-minute server schedule has not checked in recently. Keep departure reminders disabled until it is verified.",
          },
        },
        409,
      );
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const p = schema.safeParse(await smallJson(request, 4096));
    if (!p.success) throw new AccessError("INVALID_REQUEST", 400);
    const value = p.data;
    if (value.action === "settings")
      await withOwner((db) =>
        db.query("SELECT beauty.owner_arrival_settings($1::jsonb,$2)", [
          JSON.stringify(value.config),
          value.reason,
        ]),
      );
    else if (value.action === "resend")
      await withAdmin((db) =>
        db.query("SELECT beauty.admin_arrival_resend($1,$2)", [
          value.notificationId,
          value.reason,
        ]),
      );
    else
      await withAdmin((db) =>
        db.query("SELECT beauty.admin_arrival_correction($1,$2)", [
          value.bookingId,
          value.reason,
        ]),
      );
    return json({ saved: true });
  } catch (e) {
    if (e instanceof Error && e.message === "ARRIVAL_SCHEDULER_NOT_READY")
      return json(
        {
          error: {
            code: "ARRIVAL_SCHEDULER_NOT_READY",
            message:
              "The one-minute server schedule has not checked in recently. Keep departure reminders disabled until it is verified.",
          },
        },
        409,
      );
    return apiError(e);
  }
}
