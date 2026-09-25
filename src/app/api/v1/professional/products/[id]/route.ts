import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { productInputSchema } from "@/modules/shop/domain";
import { saveProduct } from "@/modules/shop/repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const parsed = productInputSchema.safeParse(await smallJson(request, 8192));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const product = await withAccount("professional", (db, account) =>
      saveProduct(db, account.professionalId!, parsed.data, id),
    );
    if (!product) throw new AccessError("FORBIDDEN", 403);
    return json({ product });
  } catch (error) {
    return apiError(error);
  }
}
