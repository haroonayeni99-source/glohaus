import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {beginOAuth,configuration,providerReady,exchangeCode,freshTokens,validateOAuthState} from '@/modules/business-tools/oauth';
const pro='14183ddb-0ff2-46f6-b86d-5c5eeb7c0ba9';
beforeEach(()=>{vi.stubEnv('BUSINESS_TOOLS_ENCRYPTION_KEY','ab'.repeat(32));vi.stubEnv('TIKTOK_ENABLED','false');vi.stubEnv('TIKTOK_CLIENT_ID','');vi.stubEnv('TIKTOK_CLIENT_SECRET','');vi.stubEnv('TIKTOK_SANDBOX_CLIENT_ID','fixture-sandbox');vi.stubEnv('TIKTOK_SANDBOX_CLIENT_SECRET','fixture-secret');vi.stubEnv('TIKTOK_SANDBOX_PROFESSIONAL_IDS',pro);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('enables only the exact allowlisted professional while public syncing stays disabled',()=>{expect(providerReady('tiktok',pro)).toBe(true);for(const other of [undefined,'other',pro+'x',''])expect(providerReady('tiktok',other)).toBe(false);expect(configuration('tiktok').sandbox).toBe(false);});
it('uses sandbox credentials and minimum scopes in an identity-bound flow',()=>{const f=beginOAuth('tiktok','fixture-owner',pro,false);const u=new URL(f.url);expect(u.searchParams.get('client_key')).toBe('fixture-sandbox');expect(u.searchParams.get('scope')).toBe('user.info.basic,video.list');expect(u.searchParams.get('redirect_uri')).toBe('https://www.glohaus.shop/api/v1/professional/connections/tiktok/callback');expect(()=>validateOAuthState(f.cookie,u.searchParams.get('state')!,'tiktok','other')).toThrow();expect(()=>beginOAuth('tiktok','other','other',false)).toThrow('NOT_CONFIGURED');});
it('tags sandbox tokens and persists rotated refresh tokens under the same app',async()=>{const transport=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:1})));vi.stubGlobal('fetch',transport);const f=beginOAuth('tiktok','fixture-owner',pro,false);const st=validateOAuthState(f.cookie,new URL(f.url).searchParams.get('state')!,'tiktok','fixture-owner');const t=await exchangeCode(st,'fixture-code');expect(t.tiktokApp).toBe('sandbox');expect(transport.mock.calls[0][1].body.get('client_key')).toBe('fixture-sandbox');await freshTokens('tiktok',t,pro);expect(transport.mock.calls[1][1].body.get('client_key')).toBe('fixture-sandbox');});
it('rejects sandbox tokens after allowlist removal even when not expired',async()=>{vi.stubEnv('TIKTOK_SANDBOX_PROFESSIONAL_IDS','');await expect(freshTokens('tiktok',{accessToken:'fixture',expiresAt:Date.now()+3600000,tiktokApp:'sandbox'},pro)).rejects.toThrow('RECONNECT_REQUIRED');});
it('does not switch existing production tokens to sandbox credentials',async()=>{await expect(freshTokens('tiktok',{accessToken:'fixture',expiresAt:Date.now()+3600000},pro)).rejects.toThrow('RECONNECT_REQUIRED');});

it('reports only fixed sandbox OAuth categories, never provider descriptions',async()=>{
  const {providerJson}=await import('@/modules/business-tools/oauth');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'invalid_client',error_description:'private provider detail'}),{status:200})));
  await expect(providerJson('https://open.tiktokapis.com/v2/oauth/token/',{},true)).rejects.toThrow('TIKTOK_INVALID_CLIENT');
  expect(await providerJson('https://open.tiktokapis.com/v2/oauth/token/')).toHaveProperty('error','invalid_client');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'untrusted private value'}),{status:400})));
  await expect(providerJson('https://open.tiktokapis.com/v2/oauth/token/',{},true)).rejects.toThrow('RECONNECT_REQUIRED');
});
