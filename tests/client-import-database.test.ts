import {afterAll,beforeAll,expect,it} from "vitest";
import {createTestDatabase,applyTestMigrations} from "./test-database";
import {enrolAccount,type SqlClient} from "@/modules/accounts/repository";
const db=await createTestDatabase();
const contact={name:"Client",email:"client@example.test",phone:"",import_permission:true,permission_date:"2026-01-01",permission_source:"Written client permission"};
beforeAll(async()=>{await applyTestMigrations(db);for(const auth of ["import-pro","import-other","import-customer"])await db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id',$1,true)",[auth]);await enrolAccount(tx,{authId:auth,email:auth+"@example.test",displayName:auth,secondFactorAge:null},auth==="import-customer"?"customer":"professional");});});
afterAll(()=>db.close());
async function isolated(work:(tx:SqlClient)=>Promise<void>){try{await db.transaction(async tx=>{await tx.exec("SET LOCAL ROLE beauty_app");await tx.query("SELECT set_config('app.auth_id','import-pro',true)");await work(tx);throw Error("ROLLBACK_IMPORT");});}catch(e){if(!(e instanceof Error&&e.message==="ROLLBACK_IMPORT"))throw e;}}
async function upload(tx:SqlClient,rows:unknown[]=[contact]){return(await tx.query<{data:{imported:number;skipped:number;replayed:boolean}}>("SELECT beauty.import_professional_clients($1::jsonb,true) AS data",[JSON.stringify(rows)])).rows[0].data;}
it("imports private contacts idempotently without creating accounts",()=>isolated(async tx=>{
 const before=(await tx.query("SELECT id FROM beauty.users")).rows.length;
 expect(await upload(tx)).toMatchObject({imported:1,skipped:0,replayed:false});expect(await upload(tx)).toMatchObject({imported:0,skipped:1,replayed:true});
 expect((await tx.query("SELECT id FROM beauty.users")).rows.length).toBe(before);
 expect((await tx.query("SELECT email FROM beauty.professional_imported_contacts WHERE removed_at IS NULL")).rows).toEqual([{email:contact.email}]);
 await tx.query("SELECT set_config('app.auth_id','import-other',true)");expect((await tx.query("SELECT id FROM beauty.professional_imported_contacts")).rows).toHaveLength(0);
}));
it("clears removed contact details and prevents resurrection through reimport",()=>isolated(async tx=>{
 await upload(tx);const id=(await tx.query<{id:string}>("SELECT id FROM beauty.professional_imported_contacts")).rows[0].id;
 await tx.query("SELECT beauty.remove_imported_client($1)",[id]);expect(await upload(tx,[{...contact,name:"Changed"}])).toMatchObject({imported:0,skipped:1});
 expect((await tx.query("SELECT name,email,phone,permission_source FROM beauty.professional_imported_contacts WHERE id=$1",[id])).rows[0]).toEqual({name:null,email:null,phone:null,permission_source:null});
}));
it("rejects invalid evidence atomically",()=>isolated(async tx=>{
 await tx.query("SAVEPOINT bad_import");await expect(upload(tx,[contact,{...contact,email:"other@example.test",import_permission:false}])).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT bad_import");expect((await tx.query("SELECT id FROM beauty.professional_imported_contacts")).rows).toHaveLength(0);
}));
it("blocks customer-role import and direct contact edits",()=>isolated(async tx=>{
 await tx.query("SAVEPOINT denied");await expect(tx.query("UPDATE beauty.professional_imported_contacts SET name='Changed'")).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT denied");
 await tx.query("SELECT set_config('app.auth_id','import-customer',true)");await tx.query("SAVEPOINT customer_denied");await expect(upload(tx)).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT customer_denied");
}));

it("pauses at the contact cap and rolls back the overflowing batch",()=>isolated(async tx=>{
 const rows=Array.from({length:500},(_,i)=>({...contact,email:`client${i}@example.test`}));expect(await upload(tx,rows)).toMatchObject({imported:500});
 await tx.query("SAVEPOINT cap");await expect(upload(tx,[{...contact,email:"overflow@example.test"}])).rejects.toThrow("IMPORT_LIMIT_REACHED");await tx.query("ROLLBACK TO SAVEPOINT cap");
 expect((await tx.query("SELECT id FROM beauty.professional_imported_contacts WHERE removed_at IS NULL")).rows).toHaveLength(500);
}));
it("prevents another professional from removing a contact and keeps the audit private",()=>isolated(async tx=>{
 await upload(tx);const id=(await tx.query<{id:string}>("SELECT id FROM beauty.professional_imported_contacts")).rows[0].id;
 await tx.query("SELECT set_config('app.auth_id','import-other',true)");await tx.query("SAVEPOINT denied_remove");await expect(tx.query("SELECT beauty.remove_imported_client($1)",[id])).rejects.toThrow("NOT_FOUND");await tx.query("ROLLBACK TO SAVEPOINT denied_remove");
 await tx.query("SAVEPOINT denied_audit");await expect(tx.query("SELECT * FROM beauty.professional_client_import_audit")).rejects.toThrow();await tx.query("ROLLBACK TO SAVEPOINT denied_audit");
}));
