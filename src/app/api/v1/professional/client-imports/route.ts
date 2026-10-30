import {z} from "zod";
import {withAccount} from "@/lib/api-account";
import {apiError,assertSameOrigin,json,smallJson} from "@/lib/http";
import {AccessError} from "@/modules/accounts/domain";
import {clientImportSchema} from "@/modules/client-imports/domain";
export async function POST(request:Request){try{
 assertSameOrigin(request);const input=clientImportSchema.safeParse(await smallJson(request,524288));if(!input.success)throw new AccessError("INVALID_REQUEST",400);
 const result=await withAccount("professional",async db=>(await db.query<{data:unknown}>("SELECT beauty.import_professional_clients($1::jsonb,true) AS data",[JSON.stringify(input.data.rows)])).rows[0].data);
 return json(result);
}catch(e){if(typeof e==="object"&&e!==null&&"message"in e&&e.message==="IMPORT_LIMIT_REACHED")return json({error:{code:"IMPORT_LIMIT_REACHED"}},409);return apiError(e);}}
export async function DELETE(request:Request){try{
 assertSameOrigin(request);const input=z.object({id:z.uuid(),confirmed:z.literal(true)}).strict().safeParse(await smallJson(request));if(!input.success)throw new AccessError("INVALID_REQUEST",400);
 await withAccount("professional",db=>db.query("SELECT beauty.remove_imported_client($1)",[input.data.id]));return json({removed:true});
}catch(e){return apiError(e);}}
