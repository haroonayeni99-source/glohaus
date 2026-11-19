import 'server-only';
/** No new schema access in production or before explicit isolated acceptance opt-in. */
export function portfolioOrganisationEnabled(env:{VERCEL_ENV?:string;PORTFOLIO_ORGANISATION_ENABLED?:string}={VERCEL_ENV:process.env.VERCEL_ENV,PORTFOLIO_ORGANISATION_ENABLED:process.env.PORTFOLIO_ORGANISATION_ENABLED}){
 return env.VERCEL_ENV==='preview'&&env.PORTFOLIO_ORGANISATION_ENABLED==='true';
}
