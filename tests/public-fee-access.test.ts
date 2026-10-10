import { createTestDatabase, applyTestMigrations } from "./test-database";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
const db=await createTestDatabase();
let owner:string;
async function asRole<T>(role:string,sql:string,params:unknown[]=[]) {
  return db.transaction(async tx=>{
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<T>(sql,params);
  });
}
beforeAll(async()=>{
  await applyTestMigrations(db);
  owner=(await db.query<{id:string}>("INSERT INTO beauty.users(auth_id,email,display_name) VALUES('fee-owner','owner@example.test','Owner') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner')",[owner]);
});
afterAll(()=>db.close());
describe.sequential("public booking-fee permission boundary",()=>{
  it("lets guests and booking workers read the default fee without private table access",async()=>{
    for(const role of ["beauty_app","beauty_booking_ops","beauty_financial_worker","beauty_payment_worker"]) {
      expect((await asRole<{fee:number}>(role,"SELECT beauty.public_booking_fee_pence() AS fee")).rows[0].fee).toBe(100);
    }
    await expect(asRole("beauty_app","SELECT * FROM beauty.financial_fee_rules")).rejects.toThrow(/permission denied/);
  });
  it("returns only the current customer booking fee, excluding private/future/expired rules",async()=>{
    await db.query(`INSERT INTO beauty.financial_fee_rules(transaction_kind,fee_payer,percentage_basis_points,fixed_fee_pence,created_by_user_id,effective_from,effective_until)
      VALUES('booking','customer',0,225,$1,now()-interval '1 minute',NULL),
      ('booking','professional',800,9999,$1,now(),NULL),
      ('booking','customer',0,400,$1,now()+interval '1 day',NULL),
      ('booking','customer',0,500,$1,now()-interval '2 days',now()-interval '1 day')`,[owner]);
    expect((await asRole<{fee:number}>("beauty_app","SELECT beauty.public_booking_fee_pence() AS fee")).rows[0].fee).toBe(225);
    expect((await asRole<{fee:number}>("beauty_booking_ops","SELECT beauty.public_booking_fee_pence() AS fee")).rows[0].fee).toBe(225);
    expect((await asRole("beauty_catalog","SELECT fixed_fee_pence FROM beauty.financial_fee_rules")).rows).toEqual([{fixed_fee_pence:225}]);
    await expect(asRole("beauty_catalog","SELECT created_by_user_id FROM beauty.financial_fee_rules")).rejects.toThrow(/permission denied/);
    const roles=await db.query<{allowed:boolean}>("SELECT has_schema_privilege('beauty_catalog','beauty','CREATE') AS allowed");
    expect(roles.rows[0].allowed).toBe(false);
  });
  it("keeps commission overrides invisible to app callers while allowing the existing finance reader",async()=>{
    const professional=(await db.query<{id:string}>("INSERT INTO beauty.professional_profiles(user_id) VALUES($1) RETURNING id",[owner])).rows[0].id;
    await db.query("INSERT INTO beauty.professional_commission_overrides(professional_id,service_commission_basis_points,reason,updated_by_user_id) VALUES($1,600,'Test commission read permissions',$2)",[professional,owner]);
    expect((await asRole("beauty_financial_worker","SELECT * FROM beauty.professional_commission_overrides")).rows).toHaveLength(1);
    await expect(asRole("beauty_app","SELECT * FROM beauty.professional_commission_overrides")).rejects.toThrow(/permission denied/);
    expect((await db.query<{forced:boolean}>("SELECT relforcerowsecurity AS forced FROM pg_class WHERE oid='beauty.professional_commission_overrides'::regclass")).rows[0].forced).toBe(true);
  });
  it("keeps exposed auth wrappers invoker-only without removing checked private implementations",async()=>{
    const roles=await db.query<{schema:string;prosecdef:boolean}>("SELECT n.nspname AS schema,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('glohaus_my_account','glohaus_enrol_self') ORDER BY n.nspname,p.proname");
    expect(roles.rows.filter(role=>role.schema==='public').every(role=>role.prosecdef===false)).toBe(true);
    expect(roles.rows.filter(role=>role.schema==='beauty_private').every(role=>role.prosecdef===true)).toBe(true);
    await expect(asRole("beauty_app","SELECT public.glohaus_my_account()")).rejects.toThrow(/permission denied/);
  });
});
