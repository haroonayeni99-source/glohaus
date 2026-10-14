import { z } from "zod";
import { withAdmin } from "@/modules/admin/repository";
import { assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { adminPolicies } from "@/modules/policies/repository";
import { policyAdminSchema } from "@/modules/policies/domain";
import { policyError } from "@/modules/policies/http";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const q = p.get("q") || "";
    const b = p.get("bookingId");
    if (q.length > 100 || (b && !z.uuid().safeParse(b).success))
      throw new AccessError("INVALID_REQUEST", 400);
    return json(await withAdmin((db) => adminPolicies(db, q, b)));
  } catch (e) {
    return policyError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const p = policyAdminSchema.safeParse(await smallJson(request, 4096));
    if (
      !p.success ||
      (p.data.action === "retention"
        ? !p.data.bookingId || p.data.approved === undefined
        : !p.data.versionId)
    )
      throw new AccessError("INVALID_REQUEST", 400);
    await withAdmin((db) =>
      db.query("SELECT beauty.admin_policy_action($1::jsonb)", [
        JSON.stringify(p.data),
      ]),
    );
    return json({ saved: true });
  } catch (e) {
    return policyError(e);
  }
}
