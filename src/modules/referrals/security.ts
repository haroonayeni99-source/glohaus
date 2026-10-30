import "server-only";
import {randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {withIdentity} from "@/lib/db";
export async function recordRequestReferralSecurity(request:Request,authId:string){
 const jar=await cookies();const current=jar.get("glohaus_security_device")?.value;
 const device=current&&/^[0-9a-f-]{36}$/.test(current)?current:randomUUID();
 const ip=process.env.VERCEL==="1"?request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()??null:null;
 await withIdentity(authId,db=>db.query("SELECT beauty.record_my_referral_security($1,$2)",[device,ip]));
 jar.set("glohaus_security_device",device,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:90*86400});
}
