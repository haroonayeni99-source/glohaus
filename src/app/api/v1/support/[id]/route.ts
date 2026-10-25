import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { withAdmin } from "@/modules/admin/repository";
import { supportTokenHash } from "@/modules/support/cases";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const read = async (
      db: import("@/modules/accounts/repository").SqlClient,
      hash: string | null,
      staff: boolean,
    ) =>
      (
        await db.query("SELECT beauty.support_case($1,$2,$3) AS data", [
          id,
          hash,
          staff,
        ])
      ).rows[0].data;
    const data = request.headers.has("x-support-token")
      ? await withIdentity("", (db) =>
          read(db, supportTokenHash(request), false),
        )
      : await withAdmin((db) => read(db, null, true));
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const hash = supportTokenHash(request);
    const parsed = z
      .object({
        body: z.string().trim().min(10).max(4000),
        appeal: z.boolean().default(false),
      })
      .strict()
      .safeParse(await smallJson(request, 20000));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withIdentity("", (db) =>
      db.query("SELECT beauty.reply_support_case($1,$2,$3,$4)", [
        id,
        hash,
        parsed.data.body,
        parsed.data.appeal,
      ]),
    );
    scheduleNotificationDelivery();
    return json({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPPORT_RATE_LIMIT")
      return json({ error: { code: "RATE_LIMITED" } }, 429);
    return apiError(error);
  }
}
