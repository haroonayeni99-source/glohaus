import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { productInputSchema } from "@/modules/shop/domain";
import {
  professionalProducts,
  saveProduct,
} from "@/modules/shop/repository";

export async function GET() {
  try {
    const products = await withAccount("professional", (db, account) =>
      professionalProducts(db, account.professionalId!),
    );
    return json({ products });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = productInputSchema.safeParse(await smallJson(request, 8192));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const product = await withAccount("professional", (db, account) =>
      saveProduct(db, account.professionalId!, parsed.data),
    );
    return json({ product }, 201);
  } catch (error) {
    return apiError(error);
  }
}
