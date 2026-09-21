import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { serviceSchema } from "@/modules/professionals/domain";
import {
  saveService,
  deactivateService,
} from "@/modules/professionals/repository";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = serviceSchema.safeParse(await smallJson(request, 4096));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      saveService(db, account.professionalId!, parsed.data, id),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}

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
      deactivateService(db, account.professionalId!, id),
    );
    return json({ deactivated: true });
  } catch (error) {
    return apiError(error);
  }
}
