import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { selectionSchema } from "@/modules/taxonomy/domain";
import { mySelection,taxonomyCatalog } from "@/modules/taxonomy/repository";
export async function GET(){try{return json(await withAccount("professional",async db=>({catalog:await taxonomyCatalog(db),selection:await mySelection(db)})));}catch(e){return apiError(e);}}
export async function PUT(request:Request){try{assertSameOrigin(request);const parsed=selectionSchema.safeParse(await smallJson(request,12000));if(!parsed.success)throw new AccessError("INVALID_REQUEST",400);return json(await withAccount("professional",async db=>(await db.query("SELECT beauty.save_my_specialities($1,$2,$3) AS selection",[parsed.data.categoryIds,parsed.data.specialityIds,parsed.data.primarySpecialityId])).rows[0]));}catch(e){return apiError(e);}}
