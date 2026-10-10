import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import type { FeatureVoteItem } from "@/lib/feature-voting";

// Accept the previous client during rollout; new clients send an explicit choice.
const schema = z.object({ featureId: z.uuid(), choice: z.enum(["like", "dislike", "none"]).optional() }).strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const { featureId, choice } = parsed.data;
    const result = await withAccount(undefined, async db => {
      if (choice === undefined) {
        await db.query("SELECT beauty.toggle_feature_vote($1)", [featureId]);
        return (await db.query<FeatureVoteItem>("SELECT * FROM beauty.feature_vote_results() WHERE id=$1", [featureId])).rows[0];
      }
      return (await db.query<{ result: FeatureVoteItem }>("SELECT beauty.set_feature_vote($1,$2) AS result", [featureId, choice])).rows[0]?.result;
    });
    if (!result) throw new Error("NOT_FOUND");
    return json({ voted: result.my_vote, result });
  } catch (error) {
    // These errors originate only from the voting functions, without exposing DB details.
    if (error instanceof Error && error.message === "VOTING_CLOSED") return json({ error: { code: "VOTING_CLOSED" } }, 409);
    if (error instanceof Error && error.message === "NOT_FOUND") return json({ error: { code: "NOT_FOUND" } }, 404);
    return apiError(error);
  }
}
