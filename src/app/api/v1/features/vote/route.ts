import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema=z.object({featureId:z.uuid()}).strict();

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const parsed=schema.safeParse(await smallJson(request,2048));
    if(!parsed.success) throw new AccessError("INVALID_REQUEST",400);
    const voted=await withAccount(undefined,async(db)=>(
      await db.query<{voted:boolean}>(
        "SELECT beauty.toggle_feature_vote($1) AS voted",[parsed.data.featureId]
      )
    ).rows[0]?.voted ?? false);
    return json({voted});
  }catch(error){return apiError(error);}
}
