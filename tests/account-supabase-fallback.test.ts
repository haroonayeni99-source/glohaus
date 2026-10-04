import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAccount, supabaseEnrolAccount } from "@/lib/account-supabase-fallback";
import { authorize } from "@/modules/accounts/domain";
const { rpc } = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc})}));
const account={id:"customer-id",authId:"auth-id",email:"test@example.test",displayName:"Test",status:"active",roles:["customer"],professionalId:null};
beforeEach(()=>vi.resetAllMocks());
describe("Supabase account fallback authorization",()=>{
  it("retains database restrictions so fallback cannot bypass account authorization",async()=>{
    rpc.mockResolvedValue({data:{...account,restrictedUntil:new Date(Date.now()+60000).toISOString(),deletedAt:null},error:null});
    const result=await supabaseAccount();
    expect(()=>authorize(result,{authId:"auth-id",email:account.email,displayName:account.displayName,secondFactorAge:null})).toThrow("ACCOUNT_INACTIVE");
  });
  it("retains deletion markers and fails closed on malformed status",async()=>{
    rpc.mockResolvedValueOnce({data:{...account,deletedAt:new Date().toISOString()},error:null});
    expect((await supabaseAccount())?.deletedAt).toBeTruthy();
    rpc.mockResolvedValueOnce({data:{...account,status:"unknown"},error:null});
    expect(await supabaseAccount()).toBeNull();
  });
  it("surfaces a restricted enrollment without retrying or granting roles",async()=>{
    rpc.mockResolvedValue({data:null,error:{code:"42501",message:"ACCOUNT_INACTIVE"}});
    await expect(supabaseEnrolAccount("professional",{adultConfirmed:true,professionalTermsAccepted:true})).rejects.toThrow("ACCOUNT_INACTIVE");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
