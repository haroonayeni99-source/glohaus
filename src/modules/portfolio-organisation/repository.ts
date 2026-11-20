import 'server-only';
import type {SqlClient} from '@/modules/accounts/repository';
import {AccessError} from '@/modules/accounts/domain';
import type {OrganisationAction,PortfolioOrganisation,WorkCollection,WorkMembership,WorkPresentation} from './domain';
export async function portfolioOrganisation(db:SqlClient,pro:string,publicOnly=false):Promise<PortfolioOrganisation>{
 const prefix=publicOnly?'public_portfolio_':'portfolio_';
 const collections=(await db.query<WorkCollection>(`SELECT id,name,${publicOnly?"'published'::text AS publication_status":"publication_status"},sort_order FROM beauty.${prefix}collections WHERE professional_id=$1 ORDER BY sort_order,id`,[pro])).rows;
 const memberships=(await db.query<WorkMembership>(`SELECT collection_id,asset_id,social_post_id FROM beauty.${prefix}collection_items WHERE professional_id=$1`,[pro])).rows;
 const presentation=(await db.query<WorkPresentation>(`SELECT asset_id,featured,sort_order FROM beauty.${prefix}asset_presentation WHERE professional_id=$1`,[pro])).rows;
 return{collections,memberships,presentation};
}
/** Caller uses the existing withIdentity transaction; failed membership changes roll back together. */
export async function savePortfolioOrganisation(db:SqlClient,pro:string,input:OrganisationAction){
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portfolio-organisation:'||$1,0))",[pro]);
 const own=await db.query("SELECT p.id FROM beauty.professional_profiles p JOIN beauty.users u ON u.id=p.user_id WHERE p.id=$1 AND u.auth_id=beauty.auth_id() AND u.status='active'",[pro]);
 if(!own.rows.length)throw new AccessError('FORBIDDEN',403);
 if(input.action==='saveCollection'){
  if(input.id){const r=await db.query('UPDATE beauty.portfolio_collections SET name=$3,publication_status=$4,sort_order=$5 WHERE id=$1 AND professional_id=$2 RETURNING id',[input.id,pro,input.name,input.publicationStatus,input.sortOrder]);if(!r.rows.length)throw new AccessError('FORBIDDEN',403);return;}
  const n=(await db.query<{count:number}>('SELECT count(*)::integer AS count FROM beauty.portfolio_collections WHERE professional_id=$1',[pro])).rows[0].count;
  if(n>=40)throw new AccessError('INVALID_REQUEST',400);
  await db.query('INSERT INTO beauty.portfolio_collections(professional_id,name,publication_status,sort_order) VALUES($1,$2,$3,$4)',[pro,input.name,input.publicationStatus,input.sortOrder]);return;
 }
 if(input.action==='deleteCollection'){
  const r=await db.query('DELETE FROM beauty.portfolio_collections WHERE id=$1 AND professional_id=$2 RETURNING id',[input.id,pro]);if(!r.rows.length)throw new AccessError('FORBIDDEN',403);return;
 }
 const upload=input.action==='saveUpload';
 const table=upload?'portfolio_assets':'social_portfolio',column=upload?'asset_id':'social_post_id';
 const source=await db.query(`SELECT id FROM beauty.${table} WHERE id=$1 AND professional_id=$2`,[input.id,pro]);
 if(!source.rows.length)throw new AccessError('FORBIDDEN',403);
 const collections=await db.query('SELECT id FROM beauty.portfolio_collections WHERE professional_id=$1 AND id=ANY($2::uuid[])',[pro,input.collectionIds]);
 if(collections.rows.length!==input.collectionIds.length)throw new AccessError('INVALID_REQUEST',400);
 await db.query(`DELETE FROM beauty.portfolio_collection_items WHERE professional_id=$1 AND ${column}=$2`,[pro,input.id]);
 for(const id of input.collectionIds)await db.query(`INSERT INTO beauty.portfolio_collection_items(professional_id,collection_id,${column}) VALUES($1,$2,$3)`,[pro,id,input.id]);
 if(upload)await db.query('INSERT INTO beauty.portfolio_asset_presentation(asset_id,professional_id,featured,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(asset_id) DO UPDATE SET featured=EXCLUDED.featured,sort_order=EXCLUDED.sort_order',[input.id,pro,input.featured,input.sortOrder]);
}
