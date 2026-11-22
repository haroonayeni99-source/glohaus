import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { createSubscription, revokeSubscription, subscriptionReady } from "@/modules/business-tools/subscription";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!subscriptionReady()) return json({ error: { code: "NOT_CONFIGURED" } }, 409);
    const input = z.object({ action: z.enum(["regenerate", "revoke"]) }).strict().safeParse(await smallJson(request));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    return await withAccount("professional", async (db, a) => {
      if (input.data.action === "revoke") {
        await revokeSubscription(db, a.professionalId!);
        return json({ revoked: true });
      }
      return json({ url: await createSubscription(db, a.authId, a.professionalId!) });
    });
  } catch (error) { return apiError(error); }
}
