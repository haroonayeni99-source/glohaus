import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { removeTimeOff } from "@/modules/availability/repository";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      removeTimeOff(db, account.professionalId!, id),
    );
    return json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
