import { z } from "zod";
import { cookies } from "next/headers";
import { withAccount } from "@/lib/api-account";
import {
  consentCookie,
  engagementEnabled,
  readConsent,
} from "@/modules/website-analytics/config";
import { assertSameOrigin, json, smallJson, apiError } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
const schema = z
  .object({
    visit: z.uuid(),
    kind: z.enum(["booking", "purchase"]),
    reference: z.uuid().nullable(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (
      !engagementEnabled() ||
      readConsent((await cookies()).get(consentCookie)?.value) !== "accepted"
    )
      return json({ converted: false }, 403);
    const body = schema.safeParse(await smallJson(request, 500));
    if (!body.success) throw new AccessError("INVALID_REQUEST", 400);
    const converted = await withAccount(
      "customer",
      async (db) =>
        (
          await db.query<{ converted: boolean }>(
            "SELECT beauty.verify_engagement_conversion($1,$2,$3) AS converted",
            [body.data.visit, body.data.kind, body.data.reference],
          )
        ).rows[0]?.converted === true,
    );
    return json({ converted });
  } catch (error) {
    return apiError(error);
  }
}
