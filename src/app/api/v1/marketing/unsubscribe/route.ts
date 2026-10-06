import { z } from "zod";
import { withPaymentWorker } from "@/modules/payments/worker";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema=z.object({token:z.uuid()}).strict();

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const parsed=schema.safeParse(await smallJson(request,2048));
    if(!parsed.success) throw new AccessError("INVALID_REQUEST",400);
    const changed=await withPaymentWorker(async(db)=>(
      await db.query<{ok:boolean}>(
        "SELECT beauty.unsubscribe_marketing($1) AS ok",[parsed.data.token]
      )
    ).rows[0]?.ok ?? false);
    if(!changed) throw new AccessError("NOT_FOUND",404);
    return json({unsubscribed:true});
  }catch(error){return apiError(error);}
}
