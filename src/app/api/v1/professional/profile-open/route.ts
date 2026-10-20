import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { assertSameOrigin, apiError, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const inputSchema=z.object({professionalId:z.string().uuid()}).strict();
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const parsed=inputSchema.safeParse(await smallJson(request,256));
    if(!parsed.success)throw new AccessError("INVALID_REQUEST",400);
    await withAccount("customer",db=>
      db.query("SELECT beauty.record_profile_open($1)",[parsed.data.professionalId])
    );
    return json({recorded:true});
  } catch(error) {return apiError(error);}
}
