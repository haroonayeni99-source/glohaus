import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { customerRebookingConsent } from "@/modules/rebooking/scope";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = customerRebookingConsent.safeParse(
      await smallJson(request, 2048),
    );
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount(undefined, (db) =>
      db.query("SELECT beauty.set_my_rebooking_consent($1,$2,$3)", [
        input.data.professionalId,
        input.data.channel,
        input.data.enabled,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
