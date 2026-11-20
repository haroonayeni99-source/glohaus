import type {PortfolioOrganisation} from './domain';
/** Only pass data from the public security-barrier projections to the public viewer. */
export function organisedWork<A extends {id:string},P extends {id:string}>(assets:A[],posts:P[],data:PortfolioOrganisation){
 const ids=(id:string,upload:boolean)=>data.memberships.filter(m=>upload?m.asset_id===id:m.social_post_id===id).map(m=>'custom:'+m.collection_id);
 return {
  assets:assets.map(a=>({...a,...data.presentation.find(p=>p.asset_id===a.id),collection_ids:ids(a.id,true)})),
  posts:posts.map(p=>({...p,collection_ids:ids(p.id,false)})),
  collections:data.collections.map(c=>({id:'custom:'+c.id,name:c.name})),
 };
}
