import { z } from "zod";
import { withAdmin } from "@/modules/admin/repository";
import { setSupportStatus } from "@/modules/support/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const parsed = z
      .object({ status: z.enum(["open", "resolved"]) })
      .strict()
      .safeParse(await smallJson(request));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAdmin((db) => setSupportStatus(db, id, parsed.data.status));
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
