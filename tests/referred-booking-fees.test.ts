import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { policyBookingTime } from "./fixtures/policy-booking-time";
import type { PolicyPreview } from "@/modules/policies/domain";

const db = await createTestDatabase();
const ids: Record<string,string> = {};
let pro: string;
let service: string;
async function as<T>(tx: SqlClient, auth: string, work: () => Promise<T>, role="beauty_app", mfa=true): Promise<T> {
  await tx.query("SAVEPOINT fee_actor");
  await tx.query(`SET LOCAL ROLE ${role}`);
  await tx.query("SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",[auth,String(mfa)]);
  try { const result=await work(); await tx.query("RESET ROLE"); await tx.query("RELEASE SAVEPOINT fee_actor"); return result; }
  catch(error) { await tx.query("ROLLBACK TO SAVEPOINT fee_actor"); await tx.query("RESET ROLE"); await tx.query("RELEASE SAVEPOINT fee_actor"); throw error; }
}
async function isolated(work:(tx:SqlClient)=>Promise<void>) {
  try { await db.transaction(async tx=>{await work(tx);throw Error("ROLLBACK_FEE_TEST");}); }
  catch(error) { if(!(error instanceof Error && error.message==="ROLLBACK_FEE_TEST")) throw error; }
}
async function configure(tx:SqlClient, standard=150, promotional=100, enabled=true) {
  return as(tx,"fee-owner",()=>tx.query("SELECT beauty.owner_set_booking_fees($1,$2,'Approved isolated fee test',$3)",[standard,promotional,enabled]));
}
async function refer(tx:SqlClient, referrer="fee-referrer", target="fee-customer") {
  await tx.query("INSERT INTO beauty.customer_referral_codes(user_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING",[ids[referrer],referrer]);
  await tx.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,$3)",[ids[referrer],ids[target],referrer]);
}
async function offer(tx:SqlClient, auth="fee-customer") {
  return as(tx,auth,async()=>(await tx.query<{data:{bookingFeePence:number;standardFeePence:number;referralDiscountPence:number;referralPromotionEligible:boolean;feePromotionReason:string}}>("SELECT beauty.my_booking_fee_offer() AS data")).rows[0].data);
}
async function preview(tx:SqlClient, auth="fee-customer") {
  return as(tx,auth,async()=>(await tx.query<{data:PolicyPreview}>("SELECT beauty.public_service_policy($1) AS data",[service])).rows[0].data);
}
async function reserve(tx:SqlClient, token?:string, hours=72, auth="fee-customer") {
  const reviewed=token??(await preview(tx,auth)).token;
  return as(tx,auth,async()=>(await tx.query<{data:{id:string;depositPence:number}}>("SELECT beauty.reserve_booking($1,$2,$3,true) AS data",[service,policyBookingTime(hours),reviewed])).rows[0].data);
}
async function quote(tx:SqlClient,id:string) {
  return as(tx,"fee-customer",async()=>(await tx.query<{data:{customerTotalPence:number;customerPlatformFeePence:number;professionalPlatformFeePence:number}}>("SELECT beauty.prepare_booking_financial_quote($1) AS data",[id])).rows[0].data);
}
beforeAll(async()=>{
  await applyTestMigrations(db);
  for(const auth of ["fee-pro","fee-customer","fee-referrer","fee-other","fee-owner","fee-alias-a","fee-alias-b"]) {
    const account=await db.transaction(tx=>as(tx,auth,()=>enrolAccount(tx,{authId:auth,email:auth+"@example.test",displayName:auth,secondFactorAge:null},auth==="fee-pro"?"professional":"customer")));
    ids[auth]=account.id;
    if(auth==="fee-pro") pro=account.professionalId!;
  }
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",[ids["fee-owner"]]);
  await db.query("UPDATE beauty.professional_profiles SET slug='fee-studio',business_name='Fee Studio',bio='Isolated booking fee validation studio',city='London',category='Nails',publication_status='published' WHERE id=$1",[pro]);
  await db.query("INSERT INTO beauty.professional_trust_status(professional_id,verification_status) VALUES($1,'verified') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",[pro]);
  await db.query("INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id,charges_enabled) VALUES($1,'acct_isolated_fees',true)",[pro]);
  service=(await db.query<{id:string}>("INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence,active) VALUES($1,'Fee manicure','',60,5000,2000,true) RETURNING id",[pro])).rows[0].id;
  for(let weekday=0;weekday<7;weekday++) await db.query("INSERT INTO beauty.availability_rules(professional_id,weekday,start_minute,end_minute) VALUES($1,$2,0,1440)",[pro,weekday]);
});
afterAll(()=>db.close());

describe("referred first-booking fees",()=>{
  it("stages the promotion off and preserves the existing standard fee",()=>isolated(async tx=>{
    await refer(tx);
    expect(await offer(tx)).toMatchObject({bookingFeePence:100,referralDiscountPence:0,feePromotionReason:"promotion_disabled"});
  }));
  it("activates the approved public prices once without changing old quotes or replaying over later Owner settings",()=>isolated(async tx=>{
    const booking=await reserve(tx);
    const release=await readFile(new URL("../db/releases/referred_booking_fees_activation.sql",import.meta.url),"utf8");
    await tx.query(release);
    expect((await offer(tx,"fee-other")).standardFeePence).toBe(150);
    expect((await quote(tx,booking.id)).customerPlatformFeePence).toBe(100);
    await configure(tx,225,125,false);
    await tx.query(release);
    expect(await offer(tx)).toMatchObject({standardFeePence:225,feePromotionReason:"promotion_disabled"});
    expect((await tx.query<{count:number}>("SELECT count(*)::integer AS count FROM beauty.financial_admin_audit_logs WHERE action='booking_fee.referral_rollout_v1'")).rows[0].count).toBe(1);
  }));
  it("quotes £1.50 to guests and non-referred customers and £1 to eligible referred customers",()=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    expect((await offer(tx,"")).bookingFeePence).toBe(150);
    expect((await offer(tx,"fee-other")).bookingFeePence).toBe(150);
    expect(await offer(tx)).toMatchObject({bookingFeePence:100,standardFeePence:150,referralDiscountPence:50,referralPromotionEligible:true});
    const policy=await preview(tx);
    expect(policy).toMatchObject({bookingFeePence:100,standardFeePence:150,referralDiscountPence:50});
    expect((await preview(tx,"")).token).not.toBe(policy.token);
  }));
  it("accepts recorded professional invitations, including existing clients new to GLOHAUS",()=>isolated(async tx=>{
    await configure(tx);
    await tx.query("INSERT INTO beauty.acquisition_invitations(professional_id) VALUES($1)",[pro]);
    await tx.query("INSERT INTO beauty.acquisition_invitation_evidence(customer_id,professional_id,medium) VALUES($1,$2,'qr')",[ids["fee-customer"],pro]);
    expect((await offer(tx)).bookingFeePence).toBe(100);
  }));
  it("saves exactly the accepted fee once in the policy, commission terms and checkout quote",()=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    const booking=await reserve(tx);
    const first=await quote(tx,booking.id); const retry=await quote(tx,booking.id);
    expect(first).toEqual(retry);
    expect(first.customerPlatformFeePence).toBe(100);
    expect(first.customerTotalPence).toBe(booking.depositPence+100);
    const saved=(await tx.query<{fee:number;policy:number;quotes:number}>("SELECT t.customer_fee_pence AS fee,(p.snapshot->>'bookingFeePence')::integer AS policy,(SELECT count(*)::integer FROM beauty.financial_quotes WHERE booking_id=$1) AS quotes FROM beauty.booking_commission_terms t JOIN beauty.booking_policy_terms p USING(booking_id) WHERE booking_id=$1",[booking.id])).rows[0];
    expect(saved).toEqual({fee:100,policy:100,quotes:1});
  }));
  it("reserves the offer for an active checkout and rejects a stale discounted policy",()=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    const policy=await preview(tx); await reserve(tx,policy.token);
    expect((await offer(tx)).bookingFeePence).toBe(150);
    await expect(reserve(tx,policy.token,120)).rejects.toThrow("POLICY_CHANGED");
    const next=await reserve(tx,undefined,120);
    expect((await quote(tx,next.id)).customerPlatformFeePence).toBe(150);
  }));
  it.each(["cancelled","expired","refunded","partially_refunded"])("restores eligibility after %s without changing the original quote",state=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    const booking=await reserve(tx); const original=await quote(tx,booking.id);
    if(state==="cancelled") await tx.query("UPDATE beauty.bookings SET status='cancelled',cancelled_at=now() WHERE id=$1",[booking.id]);
    else if(state==="expired") await tx.query("UPDATE beauty.bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",[booking.id]);
    else {
      await tx.query("UPDATE beauty.payments SET captured_pence=$2,refunded_pence=$3,status=$4 WHERE booking_id=$1",[booking.id,original.customerTotalPence,state==="refunded"?original.customerTotalPence:100,state]);
      await tx.query("UPDATE beauty.bookings SET status='completed',completed_at=now() WHERE id=$1",[booking.id]);
    }
    expect((await offer(tx)).bookingFeePence).toBe(100);
    expect((await tx.query<{fee:number}>("SELECT customer_platform_fee_pence AS fee FROM beauty.financial_quotes WHERE booking_id=$1",[booking.id])).rows[0].fee).toBe(100);
  }));
  it("uses the standard fee after the first completed paid non-refunded booking",()=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    const booking=await reserve(tx); const q=await quote(tx,booking.id);
    await tx.query("UPDATE beauty.payments SET captured_pence=$2,status='paid' WHERE booking_id=$1",[booking.id,q.customerTotalPence]);
    await tx.query("UPDATE beauty.bookings SET status='completed',completed_at=now() WHERE id=$1",[booking.id]);
    expect((await offer(tx)).bookingFeePence).toBe(150);
  }));
  it("preserves reserved and prepared fees after Owner configuration changes",()=>isolated(async tx=>{
    await configure(tx); await refer(tx);
    const booking=await reserve(tx);
    await configure(tx,225,125);
    expect((await quote(tx,booking.id)).customerPlatformFeePence).toBe(100);
    await configure(tx,250,150);
    expect((await quote(tx,booking.id)).customerPlatformFeePence).toBe(100);
  }));
  it("blocks self-referrals, invalid codes, review cases and duplicate email identities",()=>isolated(async tx=>{
    await configure(tx); await refer(tx,"fee-customer");
    expect((await offer(tx)).bookingFeePence).toBe(150);
    await tx.query("DELETE FROM beauty.customer_referrals WHERE referred_user_id=$1",[ids["fee-customer"]]);
    await refer(tx);
    await tx.query("UPDATE beauty.customer_referrals SET referral_code='invalid' WHERE referred_user_id=$1",[ids["fee-customer"]]);
    expect((await offer(tx)).bookingFeePence).toBe(150);
    await tx.query("UPDATE beauty.customer_referrals SET referral_code='fee-referrer' WHERE referred_user_id=$1",[ids["fee-customer"]]);
    await tx.query("INSERT INTO beauty.growth_referral_review_cases(referral_id,reason_code) SELECT id,'ISOLATED_REVIEW' FROM beauty.customer_referrals WHERE referred_user_id=$1",[ids["fee-customer"]]);
    expect((await offer(tx)).feePromotionReason).toBe("review_pending");
    await tx.query("UPDATE beauty.growth_referral_review_cases SET status='cleared'");
    const booking=await reserve(tx);
    await tx.query("UPDATE beauty.bookings SET customer_id=$2 WHERE id=$1",[booking.id,ids["fee-other"]]);
    await tx.query("UPDATE beauty.users SET email='FEE-CUSTOMER@EXAMPLE.TEST' WHERE id=$1",[ids["fee-other"]]);
    expect((await offer(tx)).feePromotionReason).toBe("identity_review");
  }));
  it("keeps private eligibility data and fee writes behind existing role/MFA checks",()=>isolated(async tx=>{
    await expect(as(tx,"fee-customer",()=>tx.query("SELECT beauty.owner_set_booking_fees(150,100,'Unauthorized isolated test',true)"))).rejects.toThrow();
    await expect(as(tx,"fee-owner",()=>tx.query("SELECT beauty.owner_set_booking_fees(150,100,'Expired MFA isolated test',true)"),"beauty_app",false)).rejects.toThrow();
    await expect(as(tx,"fee-customer",()=>tx.query("SELECT * FROM beauty.booking_fee_promotion_settings"))).rejects.toThrow(/permission denied/);
    await expect(as(tx,"fee-customer",()=>tx.query("SELECT beauty.booking_fee_offer_for_customer($1)",[ids["fee-other"]]))).rejects.toThrow(/permission denied/);
    await expect(configure(tx,100,150)).rejects.toThrow("INVALID_REQUEST");
  }));
  it.skipIf(process.env.GLOHAUS_NATIVE_DATABASE!=="1")("serializes simultaneous reservations so only one checkout receives the discount",async()=>{
    await db.transaction(async tx=>{await configure(tx);await refer(tx);});
    const policy=await db.transaction(tx=>preview(tx));
    const outcomes=await Promise.allSettled([72,120].map(hours=>db.transaction(tx=>reserve(tx,policy.token,hours))));
    expect(outcomes.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result=>result.status==="rejected")).toHaveLength(1);
    expect((outcomes.find(result=>result.status==="rejected") as PromiseRejectedResult).reason.message).toContain("POLICY_CHANGED");
    const discounts=await db.query<{count:number}>("SELECT count(*)::integer AS count FROM beauty.booking_commission_terms t JOIN beauty.bookings b ON b.id=t.booking_id WHERE b.customer_id=$1 AND t.customer_fee_pence=100",[ids["fee-customer"]]);
    expect(discounts.rows[0].count).toBe(1);
  });
  it.skipIf(process.env.GLOHAUS_NATIVE_DATABASE!=="1")("serializes duplicate email identities across separate accounts",async()=>{
    await db.transaction(async tx=>{
      await configure(tx);
      await refer(tx,"fee-referrer","fee-alias-a"); await refer(tx,"fee-referrer","fee-alias-b");
      await tx.query("UPDATE beauty.users SET email='FEE-ALIAS-A@EXAMPLE.TEST' WHERE id=$1",[ids["fee-alias-b"]]);
    });
    const actors=["fee-alias-a","fee-alias-b"];
    const policies=await Promise.all(actors.map(auth=>db.transaction(tx=>preview(tx,auth))));
    const outcomes=await Promise.allSettled(actors.map((auth,index)=>db.transaction(tx=>reserve(tx,policies[index].token,168+index*24,auth))));
    expect(outcomes.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect((outcomes.find(result=>result.status==="rejected") as PromiseRejectedResult).reason.message).toContain("POLICY_CHANGED");
    expect((await db.query<{count:number}>("SELECT count(*)::integer AS count FROM beauty.booking_commission_terms t JOIN beauty.bookings b ON b.id=t.booking_id WHERE b.customer_id=ANY($1::uuid[]) AND t.customer_fee_pence=100",[[ids["fee-alias-a"],ids["fee-alias-b"]]])).rows[0].count).toBe(1);
  });

});
