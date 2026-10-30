"use server";
import {redirect} from "next/navigation";
import {withOwner} from "@/modules/admin/repository";
import {penceInput} from "@/modules/referrals/dashboard";
import {referralChannels} from "@/modules/referrals/links";
function channel(form:FormData){const value=String(form.get("channel"));if(!referralChannels.includes(value as typeof referralChannels[number]))redirect("/admin/referrals?result=invalid");return value;}
async function run(sql:string,values:unknown[]=[]){const ok=await withOwner(async db=>{await db.query(sql,values);return true;}).catch(()=>false);redirect(`/admin/referrals?result=${ok?"saved":"unavailable"}`);}
export async function saveRule(form:FormData){
 const amount=penceInput(form.get("amount")),minimum=penceInput(form.get("minimum")),share=penceInput(form.get("share"));const hold=Number(form.get("hold")),personCap=Number(form.get("personCap")),cap=String(form.get("channelCap")??"");
 if(amount===null||minimum===null||share===null||![hold,personCap].every(Number.isSafeInteger)||(cap!==""&&!/^\d+$/.test(cap)))redirect("/admin/referrals?result=invalid");
 await run("SELECT beauty.owner_save_referral_rule($1,$2,$3,$4,$5,$6,$7,$8)",[channel(form),amount,hold,personCap,cap===""?null:Number(cap),minimum,share,String(form.get("reason"))]);
}
export async function saveControls(form:FormData){const input=String(form.get("budget")??"");const budget=input===""?null:penceInput(input);if(input!==""&&budget===null)redirect("/admin/referrals?result=invalid");await run("SELECT beauty.owner_referral_controls($1,$2,$3)",[budget,form.get("stop")==="on",String(form.get("reason"))]);}
export async function emergencyStop(){await run("SELECT beauty.owner_emergency_stop_referrals()");}
export async function launchChannel(form:FormData){await run("SELECT beauty.owner_launch_referral_channel($1,$2)",[channel(form),String(form.get("confirmation"))]);}
export async function pauseChannel(form:FormData){await run("SELECT beauty.owner_pause_referral_channel($1,'Owner pauses channel')",[channel(form)]);}
export async function createPartner(form:FormData){await run("SELECT beauty.owner_create_referral_partner($1,$2,$3)",[String(form.get("label")),String(form.get("kind")),String(form.get("recipient"))]);}
export async function decideRisk(form:FormData){await run("SELECT beauty.owner_referral_risk_decision($1,$2,$3)",[String(form.get("caseId")),String(form.get("decision")),String(form.get("reason"))]);}
export async function decideReward(form:FormData){await run("SELECT beauty.owner_referral_reward_decision($1,$2,$3)",[String(form.get("rewardId")),String(form.get("decision")),String(form.get("reason"))]);}
export async function refreshReferrals(){await run("SELECT beauty.owner_refresh_referral_foundation()");}
