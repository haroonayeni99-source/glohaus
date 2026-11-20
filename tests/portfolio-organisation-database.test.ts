import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createTestDatabase,applyTestMigrations} from './test-database';
import {enrolAccount,type SqlClient} from '@/modules/accounts/repository';
import {updateProfile} from '@/modules/professionals/repository';
import {portfolioOrganisation,savePortfolioOrganisation} from '@/modules/portfolio-organisation/repository';
import {organisationAction} from '@/modules/portfolio-organisation/domain';
const db=await createTestDatabase();let pro:string,other:string,asset:string,draft:string,social:string,foreignAsset:string,foreignSocial:string;
async function as<T>(id:string,work:(q:SqlClient)=>Promise<T>){return db.transaction(async q=>{await q.exec('SET LOCAL ROLE beauty_app');await q.query("SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified','false',true)",[id]);return work(q);});}
const save=(input:unknown,id='org-pro',target=pro)=>as(id,q=>savePortfolioOrganisation(q,target,organisationAction.parse(input)));
async function collection(name='Looks',status:'draft'|'published'|'hidden'='draft',order=0){await save({action:'saveCollection',name,publicationStatus:status,sortOrder:order});return(await as('org-pro',q=>portfolioOrganisation(q,pro))).collections.find(c=>c.name===name)!.id;}
beforeAll(async()=>{
 await applyTestMigrations(db);await db.exec(await readFile('db/candidates/20261119_portfolio_organisation.sql','utf8'));
 for(const id of ['org-pro','org-other'])await as(id,async q=>{const a=await enrolAccount(q,{authId:id,email:id+'@example.invalid',displayName:id,secondFactorAge:null},'professional');if(id==='org-pro')pro=a.professionalId!;else other=a.professionalId!;await updateProfile(q,a.professionalId!,{slug:id,businessName:id,bio:'Fictional isolated portfolio organisation fixture.',city:'London',category:'Hair',publicationStatus:'published'});});
 for(const [id,target] of [['org-pro',pro],['org-other',other]])await as(id,async q=>{
  const a=(await q.query<{id:string}>("INSERT INTO beauty.portfolio_assets(professional_id,blob_path,alt_text) VALUES($1,$2,'Fictional upload') RETURNING id",[target,'fixture/'+id])).rows[0].id;
  const s=(await q.query<{id:string}>("INSERT INTO beauty.social_portfolio(professional_id,platform,external_id,original_url,caption) VALUES($1,'tiktok',$2,'https://www.tiktok.com/@fixture/video/123456789','Fictional social') RETURNING id",[target,id])).rows[0].id;
  if(id==='org-pro'){asset=a;social=s;draft=(await q.query<{id:string}>("INSERT INTO beauty.portfolio_assets(professional_id,blob_path,alt_text) VALUES($1,'fixture/draft','Private upload') RETURNING id",[target])).rows[0].id;}else{foreignAsset=a;foreignSocial=s;}
 });
});
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec("DELETE FROM beauty.portfolio_collection_items; DELETE FROM beauty.portfolio_asset_presentation; DELETE FROM beauty.portfolio_collections; UPDATE beauty.users SET status='active'; UPDATE beauty.professional_profiles SET publication_status='published';");await db.query("UPDATE beauty.portfolio_assets SET publication_status=CASE WHEN id=$1 THEN 'draft' ELSE 'published' END",[draft]);await db.exec("UPDATE beauty.social_portfolio SET publication_status='published'");});
it('creates, edits, orders and deletes collections without deleting source media',async()=>{
 const id=await collection();await save({action:'saveUpload',id:asset,featured:true,sortOrder:4,collectionIds:[id]});
 await save({action:'saveCollection',id,name:'Renamed looks',publicationStatus:'published',sortOrder:9});
 let data=await as('org-pro',q=>portfolioOrganisation(q,pro));expect(data.collections[0]).toMatchObject({id,name:'Renamed looks',sort_order:9,publication_status:'published'});
 await save({action:'deleteCollection',id});data=await as('org-pro',q=>portfolioOrganisation(q,pro));expect(data.collections).toEqual([]);expect(data.memberships).toEqual([]);expect(data.presentation[0].featured).toBe(true);expect((await as('org-pro',q=>q.query('SELECT id FROM beauty.portfolio_assets WHERE id=$1',[asset]))).rows).toHaveLength(1);
});
it('pins/reorders uploaded photos and associates uploaded and social work with collections',async()=>{
 const id=await collection('Public','published');await save({action:'saveUpload',id:asset,featured:true,sortOrder:2,collectionIds:[id]});await save({action:'saveSocialCollections',id:social,collectionIds:[id]});
 const data=await as('',q=>portfolioOrganisation(q,pro,true));expect(data.presentation).toEqual([{asset_id:asset,featured:true,sort_order:2}]);expect(data.memberships).toHaveLength(2);
});
it('keeps draft/hidden collection names and memberships private',async()=>{
 for(const status of ['draft','hidden'] as const){const id=await collection(status,status);await save({action:'saveUpload',id:asset,featured:false,sortOrder:0,collectionIds:[id]});}
 const data=await as('',q=>portfolioOrganisation(q,pro,true));expect(data.collections).toEqual([]);expect(data.memberships).toEqual([]);
});
it('does not leak draft/hidden/unavailable sources from a published collection',async()=>{
 const id=await collection('Public','published');await save({action:'saveUpload',id:draft,featured:true,sortOrder:0,collectionIds:[id]});await save({action:'saveSocialCollections',id:social,collectionIds:[id]});
 for(const status of ['draft','hidden','unavailable']){await db.query('UPDATE beauty.social_portfolio SET publication_status=$1 WHERE id=$2',[status,social]);const data=await as('',q=>portfolioOrganisation(q,pro,true));expect(data.memberships).toEqual([]);expect(data.presentation).toEqual([]);}
});
it('hiding a source removes its public placement without changing its saved private settings',async()=>{
 const id=await collection('Public','published');await save({action:'saveUpload',id:asset,featured:true,sortOrder:3,collectionIds:[id]});await db.query("UPDATE beauty.portfolio_assets SET publication_status='hidden' WHERE id=$1",[asset]);
 expect((await as('',q=>portfolioOrganisation(q,pro,true))).presentation).toEqual([]);expect((await as('org-pro',q=>portfolioOrganisation(q,pro))).presentation[0].featured).toBe(true);
});
it('an unpublished professional exposes no collections or source placement',async()=>{
 const id=await collection('Public','published');await save({action:'saveUpload',id:asset,featured:true,sortOrder:0,collectionIds:[id]});await db.query("UPDATE beauty.professional_profiles SET publication_status='hidden' WHERE id=$1",[pro]);
 expect(await as('',q=>portfolioOrganisation(q,pro,true))).toEqual({collections:[],memberships:[],presentation:[]});
});
it('denies cross-professional edits and forged target professional IDs',async()=>{
 const id=await collection();await expect(save({action:'deleteCollection',id},'org-other',pro)).rejects.toMatchObject({code:'FORBIDDEN'});
 expect((await as('org-other',q=>portfolioOrganisation(q,pro))).collections).toEqual([]);
});
it('denies assigning other professionals media even when IDs are known',async()=>{
 const id=await collection();await expect(save({action:'saveUpload',id:foreignAsset,featured:true,sortOrder:0,collectionIds:[id]})).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(save({action:'saveSocialCollections',id:foreignSocial,collectionIds:[id]})).rejects.toMatchObject({code:'FORBIDDEN'});
});
it('RLS and foreign keys reject direct forged associations and placement',async()=>{
 const id=await collection();await expect(as('org-pro',q=>q.query('INSERT INTO beauty.portfolio_collection_items(professional_id,collection_id,social_post_id) VALUES($1,$2,$3)',[pro,id,foreignSocial]))).rejects.toMatchObject({code:'42501'});
 await expect(as('org-pro',q=>q.query('INSERT INTO beauty.portfolio_asset_presentation(professional_id,asset_id,featured) VALUES($1,$2,true)',[pro,foreignAsset]))).rejects.toMatchObject({code:'23503'});
 await expect(as('org-other',q=>q.query("INSERT INTO beauty.portfolio_collections(professional_id,name) VALUES($1,'Forbidden')",[pro]))).rejects.toMatchObject({code:'42501'});
});
it('invalid collection assignment is atomic and retains prior membership and ordering',async()=>{
 const id=await collection();await save({action:'saveUpload',id:asset,featured:true,sortOrder:4,collectionIds:[id]});await expect(save({action:'saveUpload',id:asset,featured:false,sortOrder:0,collectionIds:['00000000-0000-4000-8000-000000000001']})).rejects.toMatchObject({code:'INVALID_REQUEST'});
 const data=await as('org-pro',q=>portfolioOrganisation(q,pro));expect(data.memberships[0].collection_id).toBe(id);expect(data.presentation[0]).toMatchObject({featured:true,sort_order:4});
});
it('rejects case-insensitive duplicate names without changing existing collections',async()=>{await collection('Looks');await expect(collection('looks')).rejects.toMatchObject({code:'23505'});expect((await as('org-pro',q=>portfolioOrganisation(q,pro))).collections).toHaveLength(1);});
it('enforces the bounded collection limit',async()=>{await as('org-pro',q=>q.query("INSERT INTO beauty.portfolio_collections(professional_id,name) SELECT $1,'Collection '||n FROM generate_series(1,40)n",[pro]));await expect(collection('Over limit')).rejects.toMatchObject({code:'INVALID_REQUEST'});});
it('rejects suspended professionals and unauthenticated writes',async()=>{await db.query("UPDATE beauty.users SET status='suspended' WHERE auth_id='org-pro'");await expect(collection()).rejects.toMatchObject({code:'FORBIDDEN'});await expect(save({action:'saveCollection',name:'Anonymous',publicationStatus:'draft',sortOrder:0},'',pro)).rejects.toMatchObject({code:'FORBIDDEN'});});
it('new metadata never changes upload or social publication status',async()=>{const id=await collection();await save({action:'saveUpload',id:draft,featured:true,sortOrder:3,collectionIds:[id]});expect((await db.query<{publication_status:string}>('SELECT publication_status FROM beauty.portfolio_assets WHERE id=$1',[draft])).rows[0].publication_status).toBe('draft');});
