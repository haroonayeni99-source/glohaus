import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  customerCreditPence:z.number().int().min(0).max(5000),
  professionalRewardPence:z.number().int().min(0).max(5000),
}).strict();

export async function PUT(request:Request) {
  try {
    assertSameOrigin(request);
    const parsed=schema.safeParse(await smallJson(request));
    if(!parsed.success) throw new AccessError("INVALID_REQUEST",400);
    const result=await withOwner(async db=>
      (await db.query<{draft:{enabled:boolean;customerCreditPence:number;professionalRewardPence:number}}>(
        "SELECT beauty.owner_save_customer_reward_draft($1,$2) AS draft",
        [parsed.data.customerCreditPence,parsed.data.professionalRewardPence],
      )).rows[0]?.draft
    );
    return json({saved:true,draft:result,rewardsActive:false});
  } catch(error) {
    return apiError(error);
  }
}
