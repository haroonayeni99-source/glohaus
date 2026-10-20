"use server";
import {redirect} from "next/navigation";
import {withOwner} from "@/modules/admin/repository";
export async function refreshGrowthAudit() {
 const ok=await withOwner(async db=>{
 await db.query("SELECT beauty.owner_refresh_booking_attribution()");
 await db.query("SELECT beauty.owner_refresh_referral_audit()");
 return true;
 }).catch(()=>false);
 redirect("/admin/growth/review?refresh="+(ok?"success":"unavailable"));
}
export async function nominateProfessional(form:FormData) {
 const id=String(form.get("professionalId")??"");
 const reason=String(form.get("reason")??"").trim();
 const gift=String(form.get("gift")??"").trim();
 const pence=Number(form.get("amountPence"));
 if(!/^[0-9a-f-]{36}$/i.test(id)||reason.length<10||reason.length>1000||gift.length>500||!Number.isSafeInteger(pence)||pence<0||pence>10000000)
  redirect("/admin/growth/review?nomination=invalid");
 const ok=await withOwner(async db=>{
 await db.query("SELECT beauty.owner_nominate_appreciation($1,$2,$3,$4)",[id,reason,gift,pence]);return true;
 }).catch(()=>false);
 redirect("/admin/growth/review?nomination="+(ok?"saved":"unavailable"));
}
