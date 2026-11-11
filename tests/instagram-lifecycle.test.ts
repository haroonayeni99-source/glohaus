import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, applyTestMigrations } from './test-database';
import { enrolAccount, type SqlClient } from '@/modules/accounts/repository';
const io=vi.hoisted(()=>({worker:vi.fn(),identity:vi.fn()}));
vi.mock('@/modules/payments/worker',()=>({withPaymentWorker:io.worker}));
vi.mock('@/lib/db',()=>({withIdentity:io.identity}));
import { POST as deauthorize } from '@/app/api/webhooks/instagram/deauthorize/route';
import { POST as deletion } from '@/app/api/webhooks/instagram/data-deletion/route';
import { GET as status } from '@/app/api/webhooks/instagram/data-deletion/status/route';
import { instagramSubject } from '@/modules/business-tools/instagram-lifecycle';
import { storeConnection, syncProfessional } from '@/modules/business-tools/repository';
import { exchangeCode, freshTokens, type OAuthState } from '@/modules/business-tools/oauth';
const db=await createTestDatabase();
const secret='isolated-instagram-app-secret';
const now=()=>Math.floor(Date.now()/1000);
let pro:string, other:string;
async function as<T>(auth:string, work:(sql:SqlClient)=>Promise<T>) {
 return db.transaction(async tx=>{ await tx.exec('SET LOCAL ROLE beauty_app'); await tx.query("SELECT set_config('app.auth_id',$1,true)",[auth]); return work(tx); });
}
function signed(userId='987654',overrides:Record<string,unknown>={},key=secret) {
 const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:userId,issued_at:now(),...overrides})).toString('base64url');
 return createHmac('sha256',key).update(payload).digest('base64url')+'.'+payload;
}
function request(value=signed()) {return new Request('https://www.glohaus.shop/api/webhooks/instagram/data-deletion',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({signed_request:value})});}
async function connect(userId='987654',auth='ig-pro',started=Date.now()-5000) {
 return as(auth,sql=>storeConnection(sql,auth==='ig-pro'?pro:other,'instagram','Instagram',{
  accessToken:'isolated-access',expiresAt:Date.now()+3600000,
  instagram:{appId:'123456',userIds:[userId,'100'+userId],authorizationStarted:started},
 }));
}
async function post(id:string,platform='instagram',professional=pro) {
 await db.query("INSERT INTO beauty.social_portfolio(professional_id,connection_id,platform,external_id,original_url,caption,publication_status) VALUES($1,$2,$3,$4,$5,'Provider copy','published')",[professional,id,platform,'ABC'+id,`https://www.${platform}.com/${platform==='instagram'?'p':'@fixture/video'}/ABC123/`]);
}
beforeAll(async()=>{
 await applyTestMigrations(db);
 for(const auth of ['ig-pro','ig-other']) {
  const a=await as(auth,sql=>enrolAccount(sql,{authId:auth,email:auth+'@example.test',displayName:auth,secondFactorAge:null},'professional'));
  if(auth==='ig-pro') pro=a.professionalId!;else other=a.professionalId!;
 }
});
beforeEach(async()=>{
 vi.clearAllMocks();
 vi.stubEnv('INSTAGRAM_CLIENT_ID','123456');vi.stubEnv('INSTAGRAM_CLIENT_SECRET',secret);
 vi.stubEnv('INSTAGRAM_API_VERSION','v25.0');vi.stubEnv('INSTAGRAM_ENABLED','true');
 vi.stubEnv('INSTAGRAM_AUTO_PUBLISH_ENABLED','false');vi.stubEnv('BUSINESS_TOOLS_ENCRYPTION_KEY','ab'.repeat(32));
 io.worker.mockImplementation((work:(sql:SqlClient)=>Promise<unknown>)=>db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE beauty_payment_worker');return work(tx);}));
 io.identity.mockImplementation(as);
 await db.exec('TRUNCATE beauty.business_connections CASCADE; DELETE FROM beauty.instagram_revocations; DELETE FROM beauty.instagram_callback_receipts;');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});afterAll(()=>db.close());
it('authenticates deauthorization, erases credentials, stops sync and leaves unrelated data untouched',async()=>{
 const c=await connect();await post(c.id);
 const unrelated=await connect('333333','ig-other');await post(unrelated.id,'instagram',other);
 const snapshot=async()=>JSON.stringify((await db.query("SELECT (SELECT jsonb_agg(u ORDER BY id) FROM beauty.users u) AS users,(SELECT jsonb_agg(p ORDER BY id) FROM beauty.professional_profiles p) AS profiles,(SELECT count(*) FROM beauty.bookings) AS bookings,(SELECT count(*) FROM beauty.payments) AS payments")).rows);
 const before=await snapshot();
 expect((await deauthorize(request())).status).toBe(200);
 const row=(await db.query('SELECT status,secret_ciphertext,sync_enabled,auto_publish,lease_until FROM beauty.business_connections WHERE id=$1',[c.id])).rows[0];
 expect(row).toMatchObject({status:'disconnected',secret_ciphertext:'',sync_enabled:false,auto_publish:false,lease_until:null});
 expect((await db.query<{secret_ciphertext:string}>('SELECT status,secret_ciphertext FROM beauty.business_connections WHERE id=$1',[unrelated.id])).rows[0].secret_ciphertext).not.toBe('');
 expect(await snapshot()).toBe(before);
 expect(await syncProfessional('ig-pro',pro,c.id)).toEqual({synced:0,failed:0});
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.social_portfolio')).rows[0].n).toBe(2);
});
it('deletes imported data after deauthorization, returns a real receipt, and safely handles repeats',async()=>{
 const c=await connect();await post(c.id);
 const value=signed();await deauthorize(request(value));
 const first=await deletion(request(value));expect(first.status).toBe(200);
 const receipt=await first.json();expect(receipt.confirmation_code).toMatch(/^[a-f0-9]{64}$/);
 expect(receipt.url).toBe('https://www.glohaus.shop/api/webhooks/instagram/data-deletion/status?code='+receipt.confirmation_code);
 expect((await deletion(request(value))).status).toBe(200);
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.social_portfolio')).rows[0].n).toBe(0);
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.instagram_connection_subjects')).rows[0].n).toBe(0);
 expect((await (await status(new Request(receipt.url))).json()).status).toBe('completed');
 expect((await db.query<{n:number}>("SELECT count(*)::int AS n FROM beauty.instagram_callback_receipts WHERE operation='delete'")).rows[0].n).toBe(1);
 expect(JSON.stringify((await db.query('SELECT * FROM beauty.instagram_callback_receipts')).rows)).not.toContain('987654');
});
it('acknowledges an authenticated unknown account without affecting a connected account',async()=>{
 const c=await connect();await post(c.id);
 expect((await deletion(request(signed('444444')))).status).toBe(200);
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.social_portfolio')).rows[0].n).toBe(1);
 expect((await db.query<{secret_ciphertext:string}>('SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1',[c.id])).rows[0].secret_ciphertext).not.toBe('');
});
it.each([
 ()=>signed('987654',{},'wrong-secret'),()=>signed('987654',{algorithm:'SHA256'}),
 ()=>signed('../other'),()=>signed('987654',{issued_at:now()+600}),
 ()=>signed('987654',{issued_at:'yesterday'}),()=>signed('987654',{user_id:987654}),
 ()=> 'invalid.signature',()=>signed()+'.extra',
])('rejects invalid signatures/identifiers before any database work',async(value)=>{
 expect((await deletion(request(value()))).status).toBe(400);expect(io.worker).not.toHaveBeenCalled();
});
it('rejects oversized, duplicate and non-form requests',async()=>{
 const base='https://www.glohaus.shop/api/webhooks/instagram/deauthorize';
 for(const body of ['signed_request='+ 'x'.repeat(17000), 'signed_request=a&signed_request=b']) {
  expect((await deauthorize(new Request(base,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}))).status).toBe(body.length>16384?413:400);
 }
 expect((await deauthorize(new Request(base,{method:'POST',body:'{}',headers:{'content-type':'application/json'}}))).status).toBe(415);
 expect(io.worker).not.toHaveBeenCalled();
});
it('rolls back revocation/deletion and never reports completion when deletion fails',async()=>{
 const c=await connect();await post(c.id);
 await db.exec("CREATE FUNCTION beauty.ig_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated failure'; END $$; CREATE TRIGGER ig_test_failure BEFORE DELETE ON beauty.social_portfolio FOR EACH ROW EXECUTE FUNCTION beauty.ig_test_failure();");
 try {
  expect((await deletion(request())).status).toBe(503);
  expect((await db.query<{secret_ciphertext:string}>('SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1',[c.id])).rows[0].secret_ciphertext).not.toBe('');
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.instagram_callback_receipts')).rows[0].n).toBe(0);
 } finally {await db.exec('DROP TRIGGER ig_test_failure ON beauty.social_portfolio; DROP FUNCTION beauty.ig_test_failure();');}
});
it('prevents a pre-revocation OAuth attempt restoring deleted access and preserves later reconsent',async()=>{
 const started=Date.now()-5000;const c=await connect('987654','ig-pro',started);await post(c.id);
 const value=signed();await deletion(request(value));
 await expect(connect('987654','ig-pro',started)).rejects.toThrow('RECONNECT_REQUIRED');
 // A later authenticated consent must survive a retry of the old callback.
 await db.query("UPDATE beauty.instagram_revocations SET revoked_at=now()-interval '2 seconds'");
 await connect('987654','ig-pro',Date.now());
 expect((await deletion(request(value))).status).toBe(200);
 expect((await db.query<{secret_ciphertext:string}>('SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1',[c.id])).rows[0].secret_ciphertext).not.toBe('');
});
it('denies anonymous lifecycle execution and cross-professional binding',async()=>{
 const c=await connect();
 await expect(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT beauty.instagram_lifecycle_callback($1,$2,'delete',$3)",['a'.repeat(64),now(),'b'.repeat(64)]);})).rejects.toThrow(/permission denied/);
 await expect(as('ig-other',sql=>sql.query('SELECT beauty.bind_instagram_connection($1,$2,$3,now())',[c.id,'123456',[instagramSubject('123456','444444')]]))).rejects.toThrow('FORBIDDEN');
 expect((await status(new Request('https://www.glohaus.shop/api/webhooks/instagram/data-deletion/status?code='+ 'a'.repeat(64)))).status).toBe(404);
});
it('captures exact provider identities at OAuth exchange and preserves them on refresh',async()=>{
 const network=vi.fn().mockResolvedValueOnce(Response.json({access_token:'short',user_id:'987654'}))
 .mockResolvedValueOnce(Response.json({access_token:'long',expires_in:5184000}))
 .mockResolvedValueOnce(Response.json({id:'100987654',user_id:'987654'}))
 .mockResolvedValueOnce(Response.json({access_token:'refreshed',expires_in:5184000}));vi.stubGlobal('fetch',network);
 const state:OAuthState={provider:'instagram',authId:'ig-pro',professionalId:pro,nonce:'fixture',verifier:'fixture',writeCalendar:false,expiresAt:Date.now()+600000};
 const token=await exchangeCode(state,'isolated-code');
 expect(token.instagram).toMatchObject({appId:'123456',userIds:['100987654','987654']});
 expect((await freshTokens('instagram',{...token,expiresAt:0})).instagram).toEqual(token.instagram);
 expect(network.mock.calls[2][0]).toBe('https://graph.instagram.com/v25.0/me?fields=id,user_id');
});
it('fails closed when callback credentials are missing and gives status failures no false success',async()=>{
 vi.stubEnv('INSTAGRAM_CLIENT_SECRET','');expect((await deletion(request())).status).toBe(503);
 io.worker.mockRejectedValueOnce(Error('private database detail'));
 expect((await status(new Request('https://www.glohaus.shop/api/webhooks/instagram/data-deletion/status?code='+ 'a'.repeat(64)))).status).toBe(503);
});

it('does not save a provider response that arrives after deauthorization',async()=>{
 const c=await connect();
 vi.stubGlobal('fetch',vi.fn(async()=>{
  expect((await deauthorize(request())).status).toBe(200);
  return Response.json({data:[{id:'987',permalink:'https://www.instagram.com/p/ABC123/',timestamp:new Date().toISOString(),caption:'Late provider response',media_type:'IMAGE'}]});
 }));
 expect(await syncProfessional('ig-pro',pro,c.id)).toEqual({synced:0,failed:0});
 expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM beauty.social_portfolio')).rows[0].n).toBe(0);
});
