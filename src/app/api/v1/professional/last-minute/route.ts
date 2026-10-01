import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { lastMinuteInputSchema } from "@/modules/last-minute/domain";
import { createLastMinuteSlot } from "@/modules/last-minute/repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = lastMinuteInputSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const slot = await withAccount("professional", (db, account) =>
      createLastMinuteSlot(db, account.professionalId!, parsed.data),
    );
    return json({ slot }, 201);
  } catch (error) {
    return apiError(error);
  }
}
