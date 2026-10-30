import {afterAll,beforeAll,expect,it} from "vitest";
import {createTestDatabase,applyTestMigrations} from "./test-database";
import {enrolAccount,type SqlClient} from "@/modules/accounts/repository";
import {businessInsights,retentionWindow} from "@/modules/professionals/business-insights";
const db=await createTestDatabase();
let pro:string,otherPro:string,service:string;const customers:string[]=[];
beforeAll(async()=>{
 await applyTestMigrations(db);
 for(const auth of ["hub-pro","hub-other","hub-client-a","hub-client-b","hub-client-c"]){
  const a=await db.transaction(async tx=>{
   await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id',$1,true)",[auth]);
   return enrolAccount(tx,{authId:auth,email:auth+"@example.test",displayName:auth,secondFactorAge:null},auth.includes("client")?"customer":"professional");
  });
  if(auth==="hub-pro")pro=a.professionalId!;else if(auth==="hub-other")otherPro=a.professionalId!;else customers.push(a.id);
 }
 await db.query("INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good'),($2,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified'",[pro,otherPro]);
 service=(await db.query<{id:string}>("INSERT INTO beauty.services(professional_id,name,duration_minutes,price_pence,deposit_pence) VALUES($1,'Hub service',60,5000,2000) RETURNING id",[pro])).rows[0].id;
});
afterAll(()=>db.close());
async function isolated(work:(tx:SqlClient)=>Promise<void>){
 try{await db.transaction(async tx=>{await work(tx);throw Error("ROLLBACK_HUB");});}
 catch(e){if(!(e instanceof Error&&e.message==="ROLLBACK_HUB"))throw e;}
}
async function booking(tx:SqlClient,days:number,customer=customers[0],status="completed",captured=2100,refunded=0){
 const id=(await tx.query<{id:string}>(`INSERT INTO beauty.bookings(professional_id,customer_id,service_id,service_name,customer_name,professional_name,starts_at,ends_at,duration_minutes,price_pence,deposit_pence,status,hold_expires_at,completed_at)
 VALUES($1,$2,$3,'Hub service','Client','Studio',now()-$4::integer*interval '1 day'-interval '2 hours',now()-$4::integer*interval '1 day'-interval '1 hour',60,5000,2000,$5,now()+interval '1 hour',CASE WHEN $5='completed' THEN now()-$4::integer*interval '1 day' ELSE NULL END) RETURNING id`,[pro,customer,service,days,status])).rows[0].id;
 await tx.query("INSERT INTO beauty.payments(booking_id,captured_pence,refunded_pence,status,stripe_payment_intent_id) VALUES($1,$2,$3,'paid','pi_'||$1::uuid::text)",[id,captured,refunded]);return id;
}
async function read(tx:SqlClient,id=pro,window:30|60|90=30){
 await tx.query("SAVEPOINT hub_read");await tx.query("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','hub-pro',true)");
 try{const r=await businessInsights(tx,id,"month",window);await tx.query("RESET ROLE");await tx.query("RELEASE SAVEPOINT hub_read");return r;}catch(e){await tx.query("ROLLBACK TO SAVEPOINT hub_read");await tx.query("RELEASE SAVEPOINT hub_read");throw e;}
}
it("returns honest zero counts without inventing a retention cohort",()=>isolated(async tx=>{
 const r=await read(tx);expect(Object.values(r).every(x=>x===0)).toBe(true);
}));
it("counts a returning client whose first appointment predates the current period",()=>isolated(async tx=>{
 await booking(tx,50);await booking(tx,25);const r=await read(tx);
 expect(r).toMatchObject({bookings:1,clients:1,returningClients:1,multipleVisitClients:0,cohortClients:1,cohortReturned:1});
}));
it("separates multiple visits in the period from matured cohort retention",()=>isolated(async tx=>{
 await booking(tx,10);await booking(tx,2);const r=await read(tx);
 expect(r).toMatchObject({bookings:2,clients:1,returningClients:1,multipleVisitClients:1,cohortClients:0,cohortReturned:0});
}));
it("excludes cancellations, unpaid, fully refunded, future completion and disputed bookings",()=>isolated(async tx=>{
 await booking(tx,5,customers[0],"cancelled");await booking(tx,5,customers[0],"completed",0);
 await booking(tx,5,customers[0],"completed",2100,2100);await booking(tx,-2);
 const disputed=await booking(tx,5);await tx.query("INSERT INTO beauty.booking_disputes(booking_id,stripe_dispute_id,stripe_payment_intent_id,amount_pence,currency,status) VALUES($1,'dp_'||$1::uuid::text,'pi_'||$1::uuid::text,2100,'gbp','needs_response')",[disputed]);
 expect((await read(tx)).bookings).toBe(0);
}));
it("keeps gross service value separate from actual net captured deposits and fees",()=>isolated(async tx=>{
 await booking(tx,2,customers[0],"completed",2100,500);
 expect(await read(tx)).toMatchObject({bookings:1,serviceValuePence:5000,netCapturedPence:1600});
}));
it("uses a full observation window and excludes returns after its boundary",()=>isolated(async tx=>{
 await booking(tx,60);await booking(tx,30);await booking(tx,50,customers[1]);await booking(tx,19,customers[1]);await booking(tx,10,customers[2]);
 expect(await read(tx)).toMatchObject({cohortClients:2,cohortReturned:1});
}));
it("supports longer service cycles without counting immature clients",()=>isolated(async tx=>{
 await booking(tx,80);await booking(tx,25);expect(await read(tx,pro,60)).toMatchObject({cohortClients:1,cohortReturned:1});
 expect(await read(tx,pro,90)).toMatchObject({cohortClients:0,cohortReturned:0});
}));
it("counts only confirmed future appointments for current clients of this professional",()=>isolated(async tx=>{
 await booking(tx,5);await booking(tx,-3,customers[0],"confirmed");await booking(tx,-4,customers[1],"confirmed");
 expect((await read(tx)).futureBookedClients).toBe(1);
}));
it("preserves RLS even if another professional ID is supplied to the repository",()=>isolated(async tx=>{
 await booking(tx,5);expect((await read(tx,otherPro)).bookings).toBe(0);
 await tx.query("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','hub-other',true)");
 expect((await businessInsights(tx,pro,"month",30)).bookings).toBe(0);await tx.query("RESET ROLE");
}));
it("accepts only the supported return windows",()=>{
 expect(retentionWindow("60")).toBe(60);expect(retentionWindow("90")).toBe(90);expect(retentionWindow("-1")).toBe(30);
});
