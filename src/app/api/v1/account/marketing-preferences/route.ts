import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema = z.object({
  customerOffers:z.boolean().optional(),
  newProfessionals:z.boolean().optional(),
  availability:z.boolean().optional(),
  discover:z.boolean().optional(),
  shop:z.boolean().optional(),
  rebooking:z.boolean().optional(),
  professionalGrowth:z.boolean().optional(),
  marketplaceFeatures:z.boolean().optional(),
  professionalPromotions:z.boolean().optional(),
  academy:z.boolean().optional(),
  milestones:z.boolean().optional(),
  shopSelling:z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed=schema.safeParse(await smallJson(request,4096));
    if(!parsed.success) throw new AccessError("INVALID_REQUEST",400);
    const data=await withAccount(undefined,async(db)=>(
      await db.query<{data:unknown}>(
        "SELECT beauty.set_my_marketing_preferences($1::jsonb) AS data",
        [JSON.stringify(parsed.data)]
      )
    ).rows[0]?.data);
    return json({preferences:data});
  } catch(error){ return apiError(error); }
}
