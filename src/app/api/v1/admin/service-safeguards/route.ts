import { revalidatePath } from "next/cache";
import { withOwner } from "@/modules/admin/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  regulatoryApprovalSchema,
  type RegulatoryOverview,
} from "@/modules/taxonomy/regulatory";

export async function GET() {
  try {
    const data = await withOwner(
      async (db) =>
        (
          await db.query<{ data: RegulatoryOverview }>(
            "SELECT beauty.owner_regulatory_overview() AS data",
          )
        ).rows[0].data,
    );
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = regulatoryApprovalSchema.safeParse(
      await smallJson(request, 6000),
    );
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      db.query("SELECT beauty.owner_set_regulatory_clearance($1::jsonb)", [
        JSON.stringify(input.data),
      ]),
    );
    let refreshPending = false;
    try {
      revalidatePath("/explore");
      revalidatePath("/");
    } catch {
      refreshPending = true;
      console.error("Service approval saved; catalogue refresh deferred");
    }
    return json({ saved: true, refreshPending });
  } catch (error) {
    return apiError(error);
  }
}
