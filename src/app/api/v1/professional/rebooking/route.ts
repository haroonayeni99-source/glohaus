import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { professionalRebookingSettings } from "@/modules/rebooking/scope";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = professionalRebookingSettings.safeParse(
      await smallJson(request, 2048),
    );
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db) =>
      db.query("SELECT beauty.set_my_professional_rebooking($1::jsonb)", [
        JSON.stringify(input.data),
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
