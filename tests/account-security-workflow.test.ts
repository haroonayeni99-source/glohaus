import { createTestDatabase, applyTestMigrations } from "./test-database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { authorize, type Identity } from "@/modules/accounts/domain";
import { enrolAccount, ensureCustomerAccount, findAccount, type SqlClient } from "@/modules/accounts/repository";

const db = await createTestDatabase();
const ids = { customer: "00000000-0000-4000-8000-000000000001", owner: "00000000-0000-4000-8000-000000000002", admin: "00000000-0000-4000-8000-000000000003" };
const users: Record<string,string> = {};
const identity = (authId: string): Identity => ({authId,email: `${authId}@example.test`,displayName:"Test account",secondFactorAge:0});
async function asUser<T>(authId: string, verified: boolean, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)", [authId,String(verified)]);
    return work(tx);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const [name,authId] of Object.entries(ids)) {
    users[name]=(await asUser(authId,false,sql=>enrolAccount(sql,identity(authId),"customer"))).id;
    await db.query("INSERT INTO auth.users VALUES($1,$2,now())",[authId,identity(authId).email]);
  }
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($1,'admin'),($2,'admin')",[users.owner,users.admin]);
});
afterAll(()=>db.close());

describe.sequential("persisted account restrictions and owner controls",()=>{
  it("requires owner identity and verified MFA for restriction changes",async()=>{
    for (const [authId,verified] of [[ids.customer,true],[ids.admin,true],[ids.owner,false]] as const) {
      await expect(asUser(authId,verified,sql=>sql.query("SELECT beauty.owner_set_user_restriction($1,now()+interval '1 hour','Security test restriction')",[users.customer]))).rejects.toThrow("FORBIDDEN");
    }
    await expect(asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_set_user_restriction($1,now()+interval '1 hour','Protect the sole owner')",[users.owner]))).rejects.toThrow("FORBIDDEN");
  });
  it("keeps auth wrappers restricted to verified self-service account operations",async()=>{
    await expect(db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE anon");
      await tx.query("SELECT public.glohaus_my_account()");
    })).rejects.toThrow(/permission denied/);
    await db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("SELECT set_config('test.auth_id',$1,true)",[ids.customer]);
      const row=await tx.query<{account:{authId:string;roles:string[]}}>("SELECT public.glohaus_my_account() AS account");
      expect(row.rows[0].account.authId).toBe(ids.customer);
      expect(row.rows[0].account.roles).toEqual(["customer"]);
    });
    for (const [role,adult,terms] of [["owner",true,true],["admin",true,true],["professional",false,true]] as const) {
      await expect(db.transaction(async tx=>{
        await tx.exec("SET LOCAL ROLE authenticated");
        await tx.query("SELECT set_config('test.auth_id',$1,true)",[ids.customer]);
        await tx.query("SELECT public.glohaus_enrol_self($1,$2,$3)",[role,adult,terms]);
      })).rejects.toThrow("INVALID_REQUEST");
    }
  });
  it("denies restricted account authorization and both enrollment paths",async()=>{
    await asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_set_user_restriction($1,now()+interval '1 hour','Security test restriction')",[users.customer]));
    const account=await asUser(ids.customer,false,sql=>findAccount(sql,ids.customer));
    expect(()=>authorize(account,identity(ids.customer))).toThrow("ACCOUNT_INACTIVE");
    await expect(asUser(ids.customer,false,sql=>ensureCustomerAccount(sql,identity(ids.customer)))).rejects.toThrow("ACCOUNT_INACTIVE");
    await expect(asUser(ids.customer,false,sql=>enrolAccount(sql,identity(ids.customer),"professional"))).rejects.toThrow("ACCOUNT_INACTIVE");
    await expect(db.transaction(async tx=>{
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("SELECT set_config('test.auth_id',$1,true)",[ids.customer]);
      const row=await tx.query<{account:{restrictedUntil:string}}>("SELECT public.glohaus_my_account() AS account");
      expect(row.rows[0].account.restrictedUntil).toBeTruthy();
      await tx.query("SELECT public.glohaus_enrol_self('professional',true,true)");
    })).rejects.toThrow("ACCOUNT_INACTIVE");
  });
  it("keeps restriction fields operator-only and audited",async()=>{
    await expect(asUser(ids.customer,false,sql=>sql.query("UPDATE beauty.users SET restricted_until=NULL WHERE id=$1",[users.customer]))).rejects.toThrow(/permission denied/);
    await asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_set_user_restriction($1,NULL,'Owner lifted test restriction')",[users.customer]));
    expect((await asUser(ids.customer,false,sql=>ensureCustomerAccount(sql,identity(ids.customer)))).id).toBe(users.customer);
    const rows=await db.query("SELECT action FROM beauty.admin_audit_logs WHERE target_user_id=$1",[users.customer]);
    expect(rows.rows).toHaveLength(2);
    const privilege=await db.query<{allowed:boolean}>("SELECT has_schema_privilege('beauty_admin_ops','beauty','CREATE') AS allowed");
    expect(privilege.rows[0].allowed).toBe(false);
  });
  it("reads admin users through a checked routine without broadening customer RLS",async()=>{
    expect((await asUser(ids.owner,true,sql=>sql.query<{auth_id:string}>("SELECT beauty.owner_account_auth_id($1) AS auth_id",[users.customer]))).rows[0].auth_id).toBe(ids.customer);
    await expect(asUser(ids.admin,true,sql=>sql.query("SELECT beauty.owner_account_auth_id($1)",[users.customer]))).rejects.toThrow("FORBIDDEN");
    await expect(asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_account_auth_id($1)",[users.owner]))).rejects.toThrow("FORBIDDEN");
    const rows=await asUser(ids.admin,true,sql=>sql.query<{users:unknown[]}>("SELECT beauty.admin_user_overview() AS users"));
    expect(rows.rows[0].users).toHaveLength(3);
    await expect(asUser(ids.customer,true,sql=>sql.query("SELECT beauty.admin_user_overview()"))).rejects.toThrow("FORBIDDEN");
    expect((await asUser(ids.customer,false,sql=>sql.query("SELECT id FROM beauty.users"))).rows).toHaveLength(1);
  });
  it("protects the owner and makes application deletion idempotent with one audit event",async()=>{
    await expect(asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_mark_user_deleted($1,'Protect the sole owner')",[users.owner]))).rejects.toThrow("FORBIDDEN");
    for(let i=0;i<2;i++) await asUser(ids.owner,true,sql=>sql.query("SELECT beauty.owner_mark_user_deleted($1,'Delete test customer account')",[users.customer]));
    const row=await db.query<{status:string;deleted_at:string}>("SELECT status,deleted_at FROM beauty.users WHERE id=$1",[users.customer]);
    expect(row.rows[0].status).toBe("removed");
    expect(row.rows[0].deleted_at).toBeTruthy();
    expect((await db.query("SELECT id FROM beauty.admin_audit_logs WHERE target_user_id=$1 AND action='account.deleted'",[users.customer])).rows).toHaveLength(1);
  });
});
