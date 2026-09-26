import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { confirmProductOrderDelivery } from "@/modules/shop/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const order = await withAccount("customer", (db) =>
      confirmProductOrderDelivery(db, id),
    );
    return json({ order });
  } catch (error) {
    return apiError(error);
  }
}
