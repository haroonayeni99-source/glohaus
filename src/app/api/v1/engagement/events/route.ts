import { cookies } from "next/headers";
import { snapshotSchema } from "@/modules/website-analytics/domain";
import {
  engagementEnabled,
  consentCookie,
  readConsent,
} from "@/modules/website-analytics/config";
import { withIdentity } from "@/lib/db";
import { assertSameOrigin, smallJson, json, apiError } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (
      !engagementEnabled() ||
      readConsent((await cookies()).get(consentCookie)?.value) !== "accepted"
    )
      return json({ accepted: false }, 403);
    const parsed = snapshotSchema.safeParse(await smallJson(request, 24000));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const accepted = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<{ accepted: boolean }>(
            "SELECT beauty.ingest_engagement($1::jsonb) AS accepted",
            [JSON.stringify(parsed.data)],
          )
        ).rows[0]?.accepted === true,
    );
    return json({ accepted }, accepted ? 202 : 429);
  } catch (error) {
    return apiError(error);
  }
}
