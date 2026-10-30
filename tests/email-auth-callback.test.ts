import {expect,it} from "vitest";
import {emailAuthCallbackUrl} from "@/lib/email-auth-callback";
it.each(["glohaus.shop","www.glohaus.shop"])("preserves production callback origin %s",host=>{
 expect(emailAuthCallbackUrl(`https://${host}/sign-up`,"/account")).toBe(`https://${host}/auth/callback?next=%2Faccount`);
});
it("preserves ordinary preview handoff to production",()=>{
 expect(emailAuthCallbackUrl("https://preview.vercel.app/sign-up","/account")).toBe("https://www.glohaus.shop/auth/callback?next=%2Faccount");
});
it("keeps explicitly isolated signup and recovery callbacks on staging",()=>{
 for(const next of ["/account","/reset-password"])
 expect(new URL(emailAuthCallbackUrl("https://preview.vercel.app/sign-up",next,true)).origin).toBe("https://preview.vercel.app");
});
it.each(["http://preview.vercel.app","https://vercel.app.evil.invalid","https://evil.invalid"])("refuses an insecure or untrusted isolated origin",origin=>{
 expect(new URL(emailAuthCallbackUrl(origin,"/account",true)).origin).toBe("https://www.glohaus.shop");
});
