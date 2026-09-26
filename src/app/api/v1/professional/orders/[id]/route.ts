import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { fulfilmentUpdateSchema } from "@/modules/shop/domain";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const parsed = fulfilmentUpdateSchema.safeParse(
      await smallJson(request, 4096),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const order = await withAccount("professional", async (db) => {
      const result = await db.query<{ data: unknown }>(
        "SELECT beauty.advance_product_order($1,$2,$3,$4) AS data",
        [
          id,
          parsed.data.status,
          parsed.data.carrier ?? null,
          parsed.data.trackingNumber ?? null,
        ],
      );
      return result.rows[0].data;
    });

    return json({ order });
  } catch (error) {
    return apiError(error);
  }
}
