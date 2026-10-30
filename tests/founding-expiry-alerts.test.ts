import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createTestDatabase,applyTestMigrations } from "./test-database";
import { enrolAccount,type SqlClient } from "@/modules/accounts/repository";
const db=await createTestDatabase();
const ids:Record<string,string>={}; let pro:string;
async function as<T>(tx:SqlClient,auth:string,work:()=>Promise<T>,role="beauty_app") {
 await tx.query("SAVEPOINT expiry_actor"); await tx.query(`SET LOCAL ROLE ${role}`);
 await tx.query("SELECT set_config('app.auth_id',$1,true)",[auth]);
 try {const result=await work();await tx.query("RESET ROLE");await tx.query("RELEASE SAVEPOINT expiry_actor");return result;}
 catch(error){await tx.query("ROLLBACK TO SAVEPOINT expiry_actor");await tx.query("RESET ROLE");await tx.query("RELEASE SAVEPOINT expiry_actor");throw error;}
}
async function isolated(work:(tx:SqlClient)=>Promise<void>){try{await db.transaction(async tx=>{await work(tx);throw Error("ROLLBACK_EXPIRY_TEST");});}catch(e){if(!(e instanceof Error&&e.message==="ROLLBACK_EXPIRY_TEST"))throw e;}}
async function promotion(tx:SqlClient,endHours=12,kind="founding_trial"){
 return (await tx.query<{id:string}>("INSERT INTO beauty.commission_rules(kind,professional_id,basis_points,starts_at,ends_at,reason,created_by) VALUES($1,$2,0,now()-interval '13 days',now()+$3::integer*interval '1 hour','Isolated expiry notification test',$4) RETURNING id",[kind,pro,endHours,ids["expiry-owner"]])).rows[0].id;
}
async function run(tx:SqlClient){return as(tx,"",async()=>(await tx.query<{data:{alerts:number}}>("SELECT beauty.run_founding_expiry_monitor() AS data")).rows[0].data,"beauty_payment_worker");}
beforeAll(async()=>{
 await applyTestMigrations(db);
 for(const auth of ["expiry-owner","expiry-admin","expiry-pro","expiry-customer"]){
  const account=await db.transaction(tx=>as(tx,auth,()=>enrolAccount(tx,{authId:auth,email:auth+"@example.test",displayName:auth,secondFactorAge:null},auth==="expiry-pro"?"professional":"customer")));
  ids[auth]=account.id;if(auth==="expiry-pro")pro=account.professionalId!;
 }
 await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($2,'admin')",[ids["expiry-owner"],ids["expiry-admin"]]);
 await db.query("UPDATE beauty.professional_profiles SET business_name='Expiry Studio' WHERE id=$1",[pro]);
});
afterAll(()=>db.close());
describe("Owner Founding expiry alerts",()=>{
 it("queues one private heads-up inside the final 24 hours and is idempotent",()=>isolated(async tx=>{
  await promotion(tx);expect((await run(tx)).alerts).toBe(1);expect((await run(tx)).alerts).toBe(0);
  const rows=(await tx.query<{user_id:string;title:string;body:string;href:string}>("SELECT user_id,title,body,href FROM beauty.in_app_notifications WHERE kind='founding_expiry'")).rows;
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({user_id:ids["expiry-owner"],title:"Founding trial ends soon",href:"/admin"});
  expect(rows[0].body).toContain("Expiry Studio");expect(rows[0].body).toContain("London time");expect(rows[0].body).toContain("protected extension");
 }));
 it("records a separate ended alert once without changing promotion or financial rows",()=>isolated(async tx=>{
  const rule=await promotion(tx);await run(tx);
  await tx.query("UPDATE beauty.commission_rules SET ends_at=now()-interval '1 hour' WHERE id=$1",[rule]);
  const before=JSON.stringify((await tx.query("SELECT * FROM beauty.commission_rules WHERE id=$1",[rule])).rows);
  expect((await run(tx)).alerts).toBe(1);expect((await run(tx)).alerts).toBe(0);
  expect((await tx.query("SELECT stage FROM beauty.founding_expiry_alerts ORDER BY stage")).rows).toEqual([{stage:"ended"},{stage:"ending"}]);
  expect(JSON.stringify((await tx.query("SELECT * FROM beauty.commission_rules WHERE id=$1",[rule])).rows)).toBe(before);
  expect((await tx.query("SELECT (SELECT count(*)::integer FROM beauty.payments) AS payments,(SELECT count(*)::integer FROM beauty.financial_ledger_transactions) AS ledger")).rows[0]).toEqual({payments:0,ledger:0});
 }));
 it("includes a protected legacy extension without claiming that the entire offer ends with the trial",()=>isolated(async tx=>{
  await promotion(tx,12,"founding_reward");expect((await run(tx)).alerts).toBe(1);
  expect((await tx.query<{title:string}>("SELECT title FROM beauty.in_app_notifications WHERE kind='founding_expiry'")).rows[0].title).toBe("Legacy Founding extension ends soon");
 }));
 it("does not alert too early or backfill stale expired offers",()=>isolated(async tx=>{
  const rule=await promotion(tx,25);expect((await run(tx)).alerts).toBe(0);
  await tx.query("UPDATE beauty.commission_rules SET ends_at=now()-interval '8 days' WHERE id=$1",[rule]);expect((await run(tx)).alerts).toBe(0);
 }));
 it("catches a recently ended promotion even if the heads-up job was missed",()=>isolated(async tx=>{
  await promotion(tx,-1);expect((await run(tx)).alerts).toBe(1);
  expect((await tx.query("SELECT stage FROM beauty.founding_expiry_alerts")).rows).toEqual([{stage:"ended"}]);
 }));
 it("excludes a suspended, deleted or timed-restricted Owner until the account is active",()=>isolated(async tx=>{
  await promotion(tx);
  await tx.query("UPDATE beauty.users SET status='suspended' WHERE id=$1",[ids["expiry-owner"]]);
  expect((await run(tx)).alerts).toBe(0);
  await tx.query("UPDATE beauty.users SET status='active',restricted_until=now()+interval '1 day' WHERE id=$1",[ids["expiry-owner"]]);
  expect((await run(tx)).alerts).toBe(0);
  await tx.query("UPDATE beauty.users SET restricted_until=NULL,deleted_at=now() WHERE id=$1",[ids["expiry-owner"]]);
  expect((await run(tx)).alerts).toBe(0);
  await tx.query("UPDATE beauty.users SET deleted_at=NULL WHERE id=$1",[ids["expiry-owner"]]);
  expect((await run(tx)).alerts).toBe(1);
 }));
 it("enforces worker-only execution, private audit records and per-user notification access",()=>isolated(async tx=>{
  await promotion(tx);await run(tx);
  for(const auth of ["expiry-owner","expiry-admin","expiry-customer","expiry-pro"]){
   await expect(as(tx,auth,()=>tx.query("SELECT beauty.run_founding_expiry_monitor()"))).rejects.toThrow(/permission denied/);
   await expect(as(tx,auth,()=>tx.query("SELECT * FROM beauty.founding_expiry_alerts"))).rejects.toThrow(/permission denied/);
   const notes=await as(tx,auth,()=>tx.query("SELECT title FROM beauty.in_app_notifications WHERE kind='founding_expiry'"));
   expect(notes.rows).toHaveLength(auth==="expiry-owner"?1:0);
  }
 }));
});
