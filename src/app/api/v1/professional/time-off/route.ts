import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { timeOffSchema } from "@/modules/availability/domain";
import { addTimeOff } from "@/modules/availability/repository";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = timeOffSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const block = await withAccount("professional", (db, account) =>
      addTimeOff(db, account.professionalId!, parsed.data),
    );
    return json(block, 201);
  } catch (error) {
    return apiError(error);
  }
}
