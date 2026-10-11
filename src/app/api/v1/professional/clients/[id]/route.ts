import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
const schema = z.object({ blocked: z.boolean() }).strict();
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = schema.safeParse(await smallJson(request));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, account) => {
      const known = await db.query(
        `SELECT customer_id FROM beauty.bookings WHERE professional_id=$1 AND customer_id=$2 AND status IN('confirmed','completed','no_show','cancelled') UNION SELECT customer_id FROM beauty.professional_client_blocks WHERE professional_id=$1 AND customer_id=$2 LIMIT 1`,
        [account.professionalId, id],
      );
      if (!known.rows.length) throw new AccessError("FORBIDDEN", 403);
      await db.query(
        `INSERT INTO beauty.professional_client_blocks(professional_id,customer_id,blocked) VALUES($1,$2,$3) ON CONFLICT(professional_id,customer_id) DO UPDATE SET blocked=excluded.blocked`,
        [account.professionalId, id, parsed.data.blocked],
      );
    });
    return json({ blocked: parsed.data.blocked });
  } catch (error) {
    return apiError(error);
  }
}
