import {withAccount} from '@/lib/api-account';
import {apiError,assertSameOrigin,json,smallJson} from '@/lib/http';
import {AccessError} from '@/modules/accounts/domain';
import {portfolioOrganisationEnabled} from '@/lib/portfolio-organisation-gate';
import {organisationAction} from '@/modules/portfolio-organisation/domain';
import {portfolioOrganisation,savePortfolioOrganisation} from '@/modules/portfolio-organisation/repository';
export async function GET(){try{
 if(!portfolioOrganisationEnabled())throw new AccessError('UNAVAILABLE',503);
 return json(await withAccount('professional',(db,a)=>portfolioOrganisation(db,a.professionalId!)));
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);
 if(!portfolioOrganisationEnabled())throw new AccessError('UNAVAILABLE',503);
 const parsed=organisationAction.safeParse(await smallJson(request,6000));if(!parsed.success)throw new AccessError('INVALID_REQUEST',400);
 await withAccount('professional',(db,a)=>savePortfolioOrganisation(db,a.professionalId!,parsed.data));
 return json({saved:true});
}catch(e){
 if(typeof e==='object'&&e!==null&&'code'in e&&e.code==='23505')return json({error:{code:'INVALID_REQUEST'}},400);
 return apiError(e);
}}
