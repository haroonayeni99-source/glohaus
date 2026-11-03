import {withOwner} from "@/modules/admin/repository";
import {AccessError} from "@/modules/accounts/domain";
import {apiError,assertSameOrigin,json,smallJson} from "@/lib/http";
import {academyAction} from "@/modules/academies/domain";
export async function POST(request:Request){try{assertSameOrigin(request);const input=academyAction.safeParse(await smallJson(request,2048));if(!input.success)throw new AccessError("INVALID_REQUEST",400);
 const id=await withOwner(async db=>(await db.query<{id:string}>("SELECT beauty.owner_academy_action($1::jsonb) AS id",[JSON.stringify(input.data)])).rows[0].id);return json({saved:true,id});
}catch(e){return apiError(e);}}
