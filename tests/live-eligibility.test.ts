import { createTestDatabase, applyTestMigrations } from "./test-database";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import { liveEligibility } from "@/modules/live/repository";

const db = await createTestDatabase();
let professionalId: string;
async function asUser<T>(authId:string, work:(sql:SqlClient)=>Promise<T>) {
  return db.transaction(async tx => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)",[authId]);
    return work(tx);
  });
}
beforeAll(async()=>{
  await applyTestMigrations(db);
  const pro=await asUser("live-pro",sql=>enrolAccount(sql,{authId:"live-pro",email:"live@example.test",displayName:"Live Pro",secondFactorAge:null},"professional"));
  professionalId=pro.professionalId!;
  await asUser("live-pro",sql=>updateProfile(sql,professionalId,{slug:"live-pro",businessName:"Live Pro",bio:"A professional beauty creator building a community.",city:"London",category:"Makeup",publicationStatus:"published"}));
});
afterAll(()=>db.close());

describe.sequential("LIVE eligibility",()=>{
  it("starts locked and does not confuse publication with verification",async()=>{
    const state=await asUser("live-pro",sql=>liveEligibility(sql,professionalId));
    expect(state.eligible).toBe(false);
    expect(state.verified).toBe(false);
    expect(state.followersRequired).toBe(500);
    expect(state.completedBookingsRequired).toBe(10);
  });
  it("cannot inspect another professional's LIVE eligibility",async()=>{
    await asUser("other-live-user",sql=>enrolAccount(sql,{authId:"other-live-user",email:"other@example.test",displayName:"Other",secondFactorAge:null},"customer"));
    await expect(asUser("other-live-user",sql=>liveEligibility(sql,professionalId))).rejects.toThrow(/FORBIDDEN/);
  });
});
