import {describe,expect,it} from "vitest";
import {NextRequest} from "next/server";
import {referralLink,referralCookie} from "@/modules/referrals/links";
import {GET} from "@/app/r/[code]/route";
import {penceInput} from "@/modules/referrals/dashboard";
const code="GR"+"A".repeat(32);
describe("referral link handoff",()=>{
 it("preserves every explicit channel and recognises legacy aliases",()=>{for(const channel of ["customer","professional-to-professional","professional-introducing-own-customer","manual-partner"]){expect(referralLink(code,channel)).toEqual({code,channel});}expect(referralLink("GHABC12345")?.channel).toBe("professional-to-professional");expect(referralLink("GC"+"A".repeat(16))?.channel).toBe("customer");});
 it("rejects malformed cookies, codes and channels",()=>{expect(referralCookie("not json")).toBeNull();expect(referralCookie('{"code":"<script>"}')).toBeNull();expect(referralLink(code,"fake")).toBeNull();expect(referralLink("https://outside.test")).toBeNull();});
 it("redirects through the same site, stores an HttpOnly input hint and prevents caching",async()=>{const response=await GET(new NextRequest(`https://www.glohaus.shop/r/${code}?channel=professional-to-professional`),{params:Promise.resolve({code})});expect(response.headers.get("location")).toBe("https://www.glohaus.shop/sign-up?intent=professional");expect(response.cookies.get("glohaus_referral_signup")?.httpOnly).toBe(true);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");});
 it("does not write a referral cookie for malformed links",async()=>{const response=await GET(new NextRequest("https://www.glohaus.shop/r/bad"),{params:Promise.resolve({code:"bad"})});expect(response.cookies.get("glohaus_referral_signup")).toBeUndefined();});
 it("parses pounds into exact integer pence and refuses unsafe money input",()=>{expect(penceInput("100.01")).toBe(10001);expect(penceInput("0")).toBe(0);expect(penceInput("1.001")).toBeNull();expect(penceInput("-1")).toBeNull();expect(penceInput("Infinity")).toBeNull();});
});
