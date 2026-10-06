import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema=z.discriminatedUnion("type",[
  z.object({type:z.literal("launch"),preset:z.string().min(3).max(80)}).strict(),
  z.object({
    type:z.literal("feature"),
    audience:z.enum(["customer","professional","all"]),
    title:z.string().trim().min(5).max(140),
    description:z.string().trim().min(10).max(800),
  }).strict(),
]);

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const parsed=schema.safeParse(await smallJson(request,4096));
    if(!parsed.success) throw new AccessError("INVALID_REQUEST",400);
    if(parsed.data.type==="launch"){
      const campaign=await withOwner(async(db)=>(
        await db.query<{data:{campaignId:string;name:string;recipients:number}}>(
          "SELECT beauty.owner_launch_marketing_preset($1) AS data",[parsed.data.preset]
        )
      ).rows[0]?.data);
      return json({campaign});
    }
    const featureId=await withOwner(async(db)=>(
      await db.query<{id:string}>(
        "SELECT beauty.owner_create_feature_request($1,$2,$3) AS id",
        [parsed.data.audience,parsed.data.title,parsed.data.description]
      )
    ).rows[0]?.id);
    return json({featureId});
  }catch(error){return apiError(error);}
}
