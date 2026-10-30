import {NextRequest,NextResponse} from "next/server";
import {referralLink} from "@/modules/referrals/links";
import {requestOrigin} from "@/lib/request-origin";
export async function GET(request:NextRequest,{params}:{params:Promise<{code:string}>}){
 const {code}=await params;const link=referralLink(code,request.nextUrl.searchParams.get("channel")??undefined);
 const url=new URL("/sign-up",requestOrigin(request));if(link)url.searchParams.set("intent",link.channel==="professional-to-professional"?"professional":"customer");
 const response=NextResponse.redirect(url);response.headers.set("Cache-Control","private, no-store");response.headers.set("X-Robots-Tag","noindex, nofollow");
 // Input hint only. Auth INSERT resolves the code and validates its channel.
 if(link)response.cookies.set("glohaus_referral_signup",JSON.stringify(link),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:7*86400});return response;
}
