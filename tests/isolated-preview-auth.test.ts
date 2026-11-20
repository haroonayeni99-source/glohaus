import {afterEach,expect,it,vi} from "vitest";
import {productionAuthUrl} from "@/lib/preview-auth";
afterEach(()=>vi.unstubAllEnvs());
const validation="rqsyakggwmpkqzzogvll";
function isolated(){
 vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("GLOHAUS_ISOLATED_PREVIEW_AUTH","true");
 vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",`https://${validation}.supabase.co`);
 vi.stubEnv("DATABASE_URL",`postgresql://validation.${validation}:synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`);
}
it("keeps ordinary previews on the existing production handoff",()=>{
 isolated();vi.stubEnv("GLOHAUS_ISOLATED_PREVIEW_AUTH","");
 expect(productionAuthUrl("/sign-up",new URLSearchParams({intent:"customer"}))).toBe("https://glohaus.shop/sign-up?intent=customer");
});
it("permits normal Auth only when the explicit preview flag and both isolated project endpoints match",()=>{
 isolated();expect(productionAuthUrl("/sign-in")).toBeNull();
});
it.each(["NEXT_PUBLIC_SUPABASE_URL","DATABASE_URL"])("refuses a missing isolated %s",key=>{
 isolated();vi.stubEnv(key,"");expect(productionAuthUrl("/sign-in")).toBe("https://glohaus.shop/sign-in");
});
it.each([
 "postgresql://validation.tyycrmmczsgnowditnii:synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
 "postgresql://validation:synthetic@db.tyycrmmczsgnowditnii.supabase.co/postgres",
 "postgresql://validation.rqsyakggwmpkqzzogvll:synthetic@evil.invalid/postgres",
 "https://db.rqsyakggwmpkqzzogvll.supabase.co/postgres",
])("refuses a production or untrusted database endpoint",url=>{
 isolated();vi.stubEnv("DATABASE_URL",url);expect(productionAuthUrl("/sign-in")).toBe("https://glohaus.shop/sign-in");
});
it("preserves normal production behavior regardless of preview settings",()=>{
 isolated();vi.stubEnv("VERCEL_ENV","production");expect(productionAuthUrl("/sign-in")).toBeNull();
});
