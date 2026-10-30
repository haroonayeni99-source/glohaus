import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {applyTestMigrations,createTestDatabase} from "./test-database";
const db=await createTestDatabase();
let referrer:string, referred:string, other:string, professional:string,service:string,owner:string;
async function user(name:string) {
 return (await db.query<{id:string}>("INSERT INTO beauty.users(auth_id,email,display_name) VALUES($1,$2,$1) RETURNING id",[name,`${name}@example.test`])).rows[0].id;
}
beforeAll(async()=>{
 await applyTestMigrations(db);
 referrer=await user("foundation-referrer"); referred=await user("foundation-referred");other=await user("foundation-other");
 professional=(await db.query<{id:string}>("INSERT INTO beauty.professional_profiles(user_id) VALUES($1) RETURNING id",[referrer])).rows[0].id;
 await db.query("INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",[professional]);
 service=(await db.query<{id:string}>("INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Referral test',60,5000,1000) RETURNING id",[professional])).rows[0].id;
 owner=await user("foundation-owner");
 await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",[owner]);
});
afterAll(()=>db.close());
describe.sequential("permanent once-only referral attribution",()=>{
 it("blocks self referrals in both legacy channels",async()=>{
  await expect(db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$1,'GC0000000000000000')",[referrer])).rejects.toThrow(/Self referral/);
  await expect(db.query("INSERT INTO beauty.professional_referrals(referrer_professional_id,referred_user_id,referral_code) VALUES($1,$2,'GH12345678')",[professional,referrer])).rejects.toThrow(/Self referral/);
 });
 it("blocks a second claim across channels",async()=>{
  await db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[referrer,referred]);
  await expect(db.query("INSERT INTO beauty.professional_referrals(referrer_professional_id,referred_user_id,referral_code) VALUES($1,$2,'GH12345678')",[professional,referred])).rejects.toThrow(/duplicate key/);
 });
 it("also blocks customer claims after a professional claim",async()=>{
  await db.query("INSERT INTO beauty.professional_referrals(referrer_professional_id,referred_user_id,referral_code) VALUES($1,$2,'GH12345678')",[professional,other]);
  await expect(db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[referrer,other])).rejects.toThrow(/duplicate key/);
 });
 it("cannot change attribution, including through legacy rows",async()=>{
  await expect(db.query("UPDATE beauty.customer_referrals SET referrer_user_id=$1 WHERE referred_user_id=$2",[other,referred])).rejects.toThrow(/permanent/);
  await expect(db.query("UPDATE beauty.referral_first_attribution SET code='changed' WHERE referred_user_id=$1",[referred])).rejects.toThrow(/permanent/);
  await expect(db.query("DELETE FROM beauty.referral_first_attribution WHERE referred_user_id=$1",[referred])).rejects.toThrow(/permanent/);
 });
 it("retains the reservation after a legacy referral row is removed",async()=>{
  await db.query("DELETE FROM beauty.customer_referrals WHERE referred_user_id=$1",[referred]);
  await expect(db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[referrer,referred])).rejects.toThrow(/duplicate key/);
 });
 it.skipIf(process.env.GLOHAUS_NATIVE_DATABASE!=="1")("serialises simultaneous claims in different channels on native PostgreSQL",async()=>{
  const person=await user("concurrent-referral");
  const results=await Promise.allSettled([
   db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[referrer,person]),
   db.query("INSERT INTO beauty.professional_referrals(referrer_professional_id,referred_user_id,referral_code) VALUES($1,$2,'GH12345678')",[professional,person]),
  ]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  expect((await db.query<{n:number}>("SELECT count(*)::int n FROM beauty.referral_first_attribution WHERE referred_user_id=$1",[person])).rows[0].n).toBe(1);
 });
 it("does not let application callers mutate the reservation",async()=>{
  await expect(db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("DELETE FROM beauty.referral_first_attribution");})).rejects.toThrow(/permission denied/);
 });
});

async function booking(name:string,days=15) {
 const customer=await user(name);
 const source=await user(`${name}-source`);
 await db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[source,customer]);
 const id=(await db.query<{id:string}>(`INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,completed_at)
 VALUES($1,$2,$3,'Referral test','Customer','Studio',now()-interval '30 days',now()-interval '30 days'+interval '1 hour',60,5000,1000,'completed',now()-interval '31 days',now()-$4::integer*interval '1 day') RETURNING id`,[professional,customer,service,days])).rows[0].id;
 await db.query("INSERT INTO beauty.payments(booking_id,captured_pence,refunded_pence,status,stripe_payment_intent_id) VALUES($1::uuid,5100,0,'paid','pi_'||$1::uuid::text)",[id]);
 return {id,customer};
}
async function status(customer:string) {
 return (await db.query<{status:string}>(`SELECT a.new_status AS status FROM beauty.growth_referral_audit a JOIN beauty.customer_referrals r ON r.id=a.referral_id WHERE r.referred_user_id=$1 ORDER BY a.occurred_at DESC,a.id DESC LIMIT 1`,[customer])).rows[0]?.status;
}
async function ownerRefresh() {
 await db.transaction(async tx=>{
  await tx.exec("SET LOCAL ROLE beauty_app");
  await tx.query("SELECT set_config('app.auth_id','foundation-owner',true),set_config('app.admin_verified','true',true)");
  await tx.query("SELECT beauty.owner_refresh_referral_audit()");
 });
}
describe.sequential("one qualification path for events and Owner refresh",()=>{
 it("qualifies a paid completed booking after fourteen days",async()=>{
  const b=await booking("valid-referral");
  expect((await db.query<{valid:boolean}>("SELECT beauty.referral_booking_is_valid($1) valid",[b.id])).rows[0].valid).toBe(true);
  expect(await status(b.customer)).toBe("qualified");
  await ownerRefresh();expect(await status(b.customer)).toBe("qualified");
 });
 it("does not qualify registration without a booking",async()=>{
  const customer=await user("signup-only-referral");
  await db.query("INSERT INTO beauty.customer_referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,'GC0000000000000000')",[referrer,customer]);
  await ownerRefresh();expect(await status(customer)).toBe("pending");
 });
 it("waits for the refund window, in both paths",async()=>{
  const b=await booking("held-referral",13);
  expect(await status(b.customer)).toBe("pending");
  await ownerRefresh();expect(await status(b.customer)).toBe("pending");
 });
 it("excludes captured records without an on-platform payment reference",async()=>{
  const b=await booking("no-provider-reference");
  await db.query("UPDATE beauty.payments SET stripe_payment_intent_id=NULL WHERE booking_id=$1",[b.id]);
  await db.query("SELECT beauty.growth_reconcile_customer($1)",[b.customer]);
  expect((await db.query<{valid:boolean}>("SELECT beauty.referral_booking_is_valid($1) valid",[b.id])).rows[0].valid).toBe(false);
  await ownerRefresh();expect(await status(b.customer)).toBe("pending");
 });
 for(const kind of ["partial_refund","full_refund","cancelled","disputed"] as const) {
  it(`removes qualification for ${kind} and Owner refresh cannot restore it`,async()=>{
   const b=await booking(`invalid-${kind}`);
   expect(await status(b.customer)).toBe("qualified");
   if(kind==="partial_refund"||kind==="full_refund") await db.query("UPDATE beauty.payments SET refunded_pence=$2 WHERE booking_id=$1",[b.id,kind==="partial_refund"?1:5100]);
   else if(kind==="cancelled") await db.query("UPDATE beauty.bookings SET status='cancelled' WHERE id=$1",[b.id]);
   else await db.query("INSERT INTO beauty.booking_disputes(booking_id,stripe_dispute_id,stripe_payment_intent_id,amount_pence,currency,status) VALUES($1,$2,'pi_test',5100,'gbp','needs_response')",[b.id,`dp_${b.id}`]);
   expect((await db.query<{valid:boolean}>("SELECT beauty.referral_booking_is_valid($1) valid",[b.id])).rows[0].valid).toBe(false);
   await ownerRefresh();
   // A disputed case stays on hold for review, with the latest status protected.
   expect(await status(b.customer)).toBe(kind==="disputed"?"flagged":"pending");
   expect((await db.query<{n:number}>("SELECT count(*)::int n FROM beauty.growth_booking_attribution WHERE booking_id=$1",[b.id])).rows[0].n).toBe(0);
  });
 }
});
