import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { myCommissionOverview } from "@/modules/commission/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
const schema = z
  .object({
    experience: z.string().trim().min(10).max(2000),
    improve: z.string().trim().min(10).max(2000),
    useAgain: z.string().trim().min(1).max(500),
  })
  .strict();
export async function GET() {
  try {
    return json(await withAccount("professional", myCommissionOverview));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 8192));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db) =>
      db.query("SELECT beauty.submit_founding_questionnaire($1::jsonb)", [
        JSON.stringify(parsed.data),
      ]),
    );
    return json({ saved: true });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_QUESTIONNAIRE")
      return json({ error: { code: "INVALID_QUESTIONNAIRE" } }, 409);
    return apiError(e);
  }
}
