import {z} from "zod";
import {withAccount} from "@/lib/api-account";
import {AccessError} from "@/modules/accounts/domain";
import {apiError,assertSameOrigin,json,smallJson} from "@/lib/http";
import {bundleChoices} from "@/modules/bundles/repository";
import {signBundleSelection} from "@/modules/bundles/links";
const input=z.object({serviceId:z.uuid(),productId:z.uuid()}).strict();
export async function POST(request:Request){try{assertSameOrigin(request);const parsed=input.safeParse(await smallJson(request));if(!parsed.success)throw new AccessError("INVALID_REQUEST",400);
 const path=await withAccount("professional",async(db,account)=>{const choices=await bundleChoices(db,account.professionalId!);if(!choices)throw new AccessError("VERIFICATION_REQUIRED",403);if(!choices.services.some(s=>s.id===parsed.data.serviceId)||!choices.products.some(p=>p.id===parsed.data.productId))throw new AccessError("INVALID_REQUEST",400);const token=signBundleSelection({version:1,professionalId:account.professionalId!,...parsed.data});return `/p/${choices.slug}?selection=${encodeURIComponent(token)}#booking`;});return json({path});
}catch(e){return apiError(e);}}
