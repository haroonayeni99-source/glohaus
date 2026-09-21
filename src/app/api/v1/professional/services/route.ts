import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { serviceSchema } from "@/modules/professionals/domain";
import { saveService } from "@/modules/professionals/repository";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = serviceSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const service = await withAccount("professional", (db, account) =>
      saveService(db, account.professionalId!, parsed.data),
    );
    return json({ service }, 201);
  } catch (error) {
    return apiError(error);
  }
}
