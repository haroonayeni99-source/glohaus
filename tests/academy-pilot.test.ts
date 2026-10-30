import {afterAll,beforeAll,expect,it} from "vitest";
import {createTestDatabase,applyTestMigrations} from "./test-database";
import {enrolAccount,type SqlClient} from "@/modules/accounts/repository";
import {academyAction} from "@/modules/academies/domain";
const db=await createTestDatabase();let pro:string,owner:string;
beforeAll(async()=>{await applyTestMigrations(db);for(const auth of ["academy-owner","academy-pro","academy-outsider"]){const account=await db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id',$1,true)",[auth]);return enrolAccount(tx,{authId:auth,email:auth+"@example.test",displayName:auth,secondFactorAge:null},auth==="academy-pro"?"professional":"customer");});if(auth==="academy-pro")pro=account.professionalId!;if(auth==="academy-owner")owner=account.id;}await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($1,'admin')",[owner]);});
afterAll(()=>db.close());
async function isolated(work:(tx:SqlClient)=>Promise<void>){try{await db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','academy-owner',true),set_config('app.admin_verified','true',true)");await work(tx);throw Error("ROLLBACK_ACADEMY");});}catch(e){if(!(e instanceof Error&&e.message==="ROLLBACK_ACADEMY"))throw e;}}
async function act(tx:SqlClient,payload:unknown){return(await tx.query<{id:string}>("SELECT beauty.owner_academy_action($1::jsonb) AS id",[JSON.stringify(payload)])).rows[0].id;}
const create={action:"create",academy:"Pilot Academy",cohort:"Autumn graduates",reason:"Approved academy pilot"};
it("creates drafts, requires active cohorts, and shows genuine setup state",()=>isolated(async tx=>{
 const id=await act(tx,create);await tx.query("SAVEPOINT draft_add");await expect(act(tx,{action:"add",id,professionalId:pro,permissionEvidence:"Written graduate agreement",reason:"Graduate requested membership"})).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT draft_add");
 await act(tx,{action:"state",id,state:"active",reason:"Start approved cohort"});await act(tx,{action:"add",id,professionalId:pro,permissionEvidence:"Written graduate agreement",reason:"Graduate requested membership"});
 const data=(await tx.query<{data:{members:unknown[]}}>("SELECT beauty.owner_academy_overview() AS data")).rows[0].data;expect(data.members).toEqual([expect.objectContaining({professionalId:pro,published:false,services:false,availability:false,completedPaidBookings:0})]);
 await act(tx,{action:"add",id,professionalId:pro,permissionEvidence:"Written graduate agreement",reason:"Idempotent duplicate attempt"});expect((await tx.query<{data:{members:unknown[]}}>("SELECT beauty.owner_academy_overview() AS data")).rows[0].data.members).toHaveLength(1);
 await act(tx,{action:"remove",id,professionalId:pro,reason:"Graduate withdrew permission"});expect((await tx.query<{data:{members:unknown[]}}>("SELECT beauty.owner_academy_overview() AS data")).rows[0].data.members).toHaveLength(0);
}));
it("blocks non-owners and bypasses without a verified Owner context",()=>isolated(async tx=>{
 await tx.query("SELECT set_config('app.auth_id','academy-outsider',true)");await tx.query("SAVEPOINT outsider");await expect(act(tx,create)).rejects.toThrow("FORBIDDEN");await tx.query("ROLLBACK TO SAVEPOINT outsider");
 await tx.query("SELECT set_config('app.auth_id','academy-owner',true),set_config('app.admin_verified','false',true)");await tx.query("SAVEPOINT unverified");await expect(tx.query("SELECT beauty.owner_academy_overview()")).rejects.toThrow("FORBIDDEN");await tx.query("ROLLBACK TO SAVEPOINT unverified");
}));
it("keeps private academy tables inaccessible to application callers",()=>isolated(async tx=>{await tx.query("SAVEPOINT direct_read");await expect(tx.query("SELECT * FROM beauty.academy_cohort_members")).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT direct_read");}));
it("rejects injected referral, reward or marketing fields",()=>{expect(academyAction.safeParse({...create,reward:500}).success).toBe(false);expect(academyAction.safeParse({action:"add",id:crypto.randomUUID(),professionalId:crypto.randomUUID(),permissionEvidence:"",reason:"Join approved cohort"}).success).toBe(false);});
