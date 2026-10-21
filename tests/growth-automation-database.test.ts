import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {applyTestMigrations,createTestDatabase} from "./test-database";

const db=await createTestDatabase();
beforeAll(async()=>{await applyTestMigrations(db);});
afterAll(async()=>{await db.close();});

describe("growth event reconciliation and recognition security",()=>{
 it("installs database event hooks for verified source events",async()=>{
  const result=await db.query<{tgname:string}>(
   "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'growth_%' ORDER BY tgname"
  );
  const names=result.rows.map(row=>row.tgname);
  expect(names).toContain("growth_referral_insert");
  expect(names).toContain("growth_booking_changed");
  expect(names).toContain("growth_payment_changed");
  expect(names).toContain("growth_dispute_changed");
 });
 it("keeps reconciliation and appreciation functions server-protected",async()=>{
  const query=await db.query<{proname:string;granted:boolean}>(
   `SELECT p.proname,has_function_privilege('beauty_app',p.oid,'EXECUTE') AS granted
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='beauty'
    AND p.proname IN ('growth_reconcile_customer','growth_reconcile_all','owner_transition_appreciation')`
  );
  const grants=new Map(query.rows.map(row=>[row.proname,row.granted]));
  expect(grants.get("growth_reconcile_customer")).toBe(false);
  expect(grants.get("growth_reconcile_all")).toBe(false);
  expect(grants.get("owner_transition_appreciation")).toBe(true);
 });
 it("rejects unauthorized Owner approval",async()=>{
  await expect(db.query("SELECT beauty.owner_transition_appreciation(gen_random_uuid(),'approved')")).rejects.toThrow();
 });
});
