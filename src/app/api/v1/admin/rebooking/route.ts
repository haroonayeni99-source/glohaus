import {z} from "zod";
import {rebookingSettings} from "@/modules/rebooking/domain";
import {withOwner} from "@/modules/admin/repository";
import {AccessError} from "@/modules/accounts/domain";
import {apiError,assertSameOrigin,json,smallJson} from "@/lib/http";
export async function POST(request:Request){try{assertSameOrigin(request);const raw=await smallJson(request,2048);if(z.object({action:z.literal("stop")}).strict().safeParse(raw).success){await withOwner(db=>db.query("SELECT beauty.owner_rebooking_stop()"));return json({saved:true,enabled:false});}const input=rebookingSettings.safeParse(raw);if(!input.success)throw new AccessError("INVALID_REQUEST",400);
 const {reason,...rules}=input.data;await withOwner(db=>db.query("SELECT beauty.owner_rebooking_settings($1::jsonb,$2)",[JSON.stringify(rules),reason]));return json({saved:true});}catch(e){return apiError(e);}}
