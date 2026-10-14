import { withAccount } from "@/lib/api-account";
import { assertSameOrigin, json, smallJson } from "@/lib/http";
import { policyWorkspace } from "@/modules/policies/repository";
import { policySaveSchema } from "@/modules/policies/domain";
import { policyError } from "@/modules/policies/http";
export async function GET() {
  try {
    return json(await withAccount("professional", policyWorkspace));
  } catch (e) {
    return policyError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const p = policySaveSchema.safeParse(await smallJson(request, 32768));
    if (!p.success)
      return json(
        {
          error: {
            code: "INVALID_POLICY",
            message: p.error.issues.map((i) => i.message).join(" "),
          },
        },
        400,
      );
    const v = p.data;
    const result = await withAccount(
      "professional",
      async (db) =>
        (
          await db.query<{ data: unknown }>(
            "SELECT beauty.save_my_professional_policy($1,$2,$3,$4::jsonb) AS data",
            [
              v.serviceId,
              v.action,
              v.expectedRevision,
              JSON.stringify(v.policy),
            ],
          )
        ).rows[0].data,
    );
    return json(result);
  } catch (e) {
    return policyError(e);
  }
}
