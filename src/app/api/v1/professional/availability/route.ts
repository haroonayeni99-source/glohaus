import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { scheduleSchema } from "@/modules/availability/domain";
import { saveSchedule } from "@/modules/availability/repository";
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = scheduleSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      saveSchedule(db, account.professionalId!, parsed.data.rules),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
