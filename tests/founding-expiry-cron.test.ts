import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { GET } from "@/app/api/cron/maintenance/route";
const mocks=vi.hoisted(()=>({worker:vi.fn(),query:vi.fn(),fail:false}));
vi.mock("@/modules/payments/worker",()=>({withPaymentWorker:mocks.worker}));
vi.mock("@/modules/commission/provider-cost",()=>({retryBookingProviderCosts:async()=>({reconciled:0})}));
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("CRON_SECRET","isolated-cron-fixture");mocks.fail=false;
 mocks.query.mockImplementation(async(sql:string)=>{
  if(sql.includes("run_founding_expiry_monitor")){if(mocks.fail)throw Error("Isolated failure");return {rows:[{data:{alerts:2}}]};}
  if(sql.includes("run_referral_reward_monitor"))return {rows:[{processed:3}]};
  if(sql.includes("run_scheduled_maintenance"))return {rows:[{result:{released:0}}]};
  return {rows:[{data:{alerts:0}}]};
 });
 mocks.worker.mockImplementation(async(work:(db:unknown)=>Promise<unknown>)=>work({query:mocks.query}));
});
afterEach(()=>vi.unstubAllEnvs());
it("does not run any job without the existing cron authorization",async()=>{
 expect((await GET(new Request("https://glohaus.test/api/cron/maintenance"))).status).toBe(401);
 expect(mocks.worker).not.toHaveBeenCalled();
});
it("runs the Founding monitor and returns its queued-alert count",async()=>{
 const response=await GET(new Request("https://glohaus.test/api/cron/maintenance",{headers:{authorization:"Bearer isolated-cron-fixture"}}));
 expect(response.status).toBe(200);const result=await response.json();expect(result.founding).toEqual({alerts:2});expect(result.referrals).toBe(3);
 expect(mocks.query.mock.calls.some(([sql])=>sql.includes("run_founding_expiry_monitor"))).toBe(true);
});
it("reports a failed monitor as retryable rather than silently losing alerts",async()=>{
 mocks.fail=true;
 const response=await GET(new Request("https://glohaus.test/api/cron/maintenance",{headers:{authorization:"Bearer isolated-cron-fixture"}}));
 expect(response.status).toBe(503);
 expect(mocks.query.mock.calls.some(([sql,args])=>sql.includes("record_backend_job_run")&&args[1]===false)).toBe(true);
});
