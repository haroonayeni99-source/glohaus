import {afterAll,beforeAll,expect,it} from "vitest";
import {createTestDatabase,applyTestMigrations} from "./test-database";
import {enrolAccount,type SqlClient} from "@/modules/accounts/repository";
import {defaultDiscoveryFilters} from "@/modules/professionals/discovery";
import {publicProfessionals} from "@/modules/professionals/repository";
const db=await createTestDatabase();let pro:string,service:string,boho:string;
beforeAll(async()=>{await applyTestMigrations(db);const account=await db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','needs-pro',true)");return enrolAccount(tx,{authId:"needs-pro",email:"needs-pro@example.test",displayName:"Studio",secondFactorAge:null},"professional");});pro=account.professionalId!;
 await db.query("UPDATE beauty.professional_profiles SET publication_status='published',slug='needs-studio',business_name='Needs Studio',bio='Complete beauty profile for discovery fixtures.',city='London' WHERE id=$1",[pro]);
 await db.query("INSERT INTO beauty.professional_trust_status(professional_id,verification_status,standing_status) VALUES($1,'verified','good') ON CONFLICT(professional_id) DO UPDATE SET verification_status='verified',standing_status='good'",[pro]);
 service=(await db.query<{id:string}>("INSERT INTO beauty.services(professional_id,name,description,duration_minutes,price_pence,deposit_pence) VALUES($1,'Braids','Wheelchair access is available. Please discuss scalp preparation before booking.',60,5000,2000) RETURNING id",[pro])).rows[0].id;
 boho=(await db.query<{id:string}>("INSERT INTO beauty.service_options(service_id,kind,name,price_pence,duration_minutes,attributes) VALUES($1,'variation','Boho finish',6000,90,'{\"length\":\"waist\"}') RETURNING id",[service])).rows[0].id;
 await db.query("INSERT INTO beauty.service_options(service_id,kind,name,price_pence,duration_minutes,attributes) VALUES($1,'variation','Silk finish',7000,90,'{}')",[service]);});
afterAll(()=>db.close());
async function isolated(work:(tx:SqlClient)=>Promise<void>){try{await db.transaction(async tx=>{await work(tx);throw Error("ROLLBACK_NEEDS");});}catch(e){if(!(e instanceof Error&&e.message==="ROLLBACK_NEEDS"))throw e;}}
async function search(tx:SqlClient,q:string){await tx.query("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','',true)");try{return await publicProfessionals(tx,q);}finally{await tx.query("RESET ROLE");}}
it("finds stated customer needs within a published service description",()=>isolated(async tx=>{const rows=await search(tx,"wheelchair access");expect(rows.map(p=>p.id)).toContain(pro);expect(rows.find(p=>p.id===pro)?.matching_services?.map(s=>s.id)).toContain(service);}));
it("matches a style and attribute on the same active public option",()=>isolated(async tx=>{expect((await search(tx,"boho waist")).map(p=>p.id)).toContain(pro);}));
it("does not combine incompatible option words or invent unstated needs",()=>isolated(async tx=>{expect((await search(tx,"boho silk")).map(p=>p.id)).not.toContain(pro);expect((await search(tx,"hypoallergenic")).map(p=>p.id)).not.toContain(pro);}));
it("excludes hidden options and unpublished services",()=>isolated(async tx=>{await tx.query("UPDATE beauty.service_options SET active=false WHERE id=$1",[boho]);expect((await search(tx,"boho waist")).map(p=>p.id)).not.toContain(pro);await tx.query("UPDATE beauty.services SET active=false WHERE id=$1",[service]);expect((await search(tx,"wheelchair access")).map(p=>p.id)).not.toContain(pro);}));

it("does not pass an expensive matching style through a cheaper base-service price filter",()=>isolated(async tx=>{
 await tx.query("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','',true)");
 const rows=await publicProfessionals(tx,"boho waist",undefined,{...defaultDiscoveryFilters,under50:true});await tx.query("RESET ROLE");expect(rows.map(p=>p.id)).not.toContain(pro);
}));
