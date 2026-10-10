import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/features/vote/route";
import { POST as publish } from "@/app/api/v1/admin/marketing/route";
import { AccessError } from "@/modules/accounts/domain";
const mocks=vi.hoisted(()=>({query:vi.fn(),denied:false}));
vi.mock("@/lib/api-account",()=>({withAccount:async (_:unknown,work:(sql:object)=>unknown)=>{if(mocks.denied) throw new AccessError("UNAUTHENTICATED",401); return work({query:mocks.query});}}));
vi.mock("@/modules/admin/repository",()=>({withOwner:async (work:(sql:object)=>unknown)=>work({query:mocks.query})}));
const id="11111111-1111-4111-8111-111111111111";
const result={id,my_vote:false,my_choice:"dislike",vote_count:3,dislike_count:2,total_count:5};
function request(body:unknown,origin="https://glohaus.test") { return new Request("https://glohaus.test/api/v1/features/vote",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)}); }
beforeEach(()=>{vi.clearAllMocks();mocks.denied=false;mocks.query.mockResolvedValue({rows:[{result,...result}]});});
it("returns authoritative totals and selection for an explicit choice",async()=>{
  const response=await POST(request({featureId:id,choice:"dislike"}));expect(response.status).toBe(200);expect(await response.json()).toEqual({voted:false,result});
  expect(mocks.query).toHaveBeenCalledWith("SELECT beauty.set_feature_vote($1,$2) AS result",[id,"dislike"]);
});
it("keeps the previous toggle payload compatible",async()=>{expect((await POST(request({featureId:id}))).status).toBe(200);expect(mocks.query.mock.calls[0][0]).toContain("toggle_feature_vote");});
it.each(["maybe",null,1])("rejects invalid choice %s before SQL",async choice=>{expect((await POST(request({featureId:id,choice}))).status).toBe(400);expect(mocks.query).not.toHaveBeenCalled();});
it("blocks cross-origin and unauthenticated votes",async()=>{
  expect((await POST(request({featureId:id,choice:"like"},"https://other.test"))).status).toBe(403);expect(mocks.query).not.toHaveBeenCalled();
  mocks.denied=true;expect((await POST(request({featureId:id,choice:"like"}))).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
});
it("returns a clear closed response and preserves database failures as unavailable",async()=>{
  mocks.query.mockRejectedValueOnce(new Error("VOTING_CLOSED"));const response=await POST(request({featureId:id,choice:"like"}));expect(response.status).toBe(409);expect(await response.json()).toEqual({error:{code:"VOTING_CLOSED"}});
  mocks.query.mockRejectedValueOnce(new Error("private DB detail"));const failed=await POST(request({featureId:id,choice:"like"}));expect(failed.status).toBe(503);expect(JSON.stringify(await failed.json())).not.toContain("private DB detail");
});
it.each([undefined,1,90])("publishes with valid/default duration %s",async durationDays=>{
  expect((await publish(request({type:"feature",audience:"all",title:"Clearer booking",description:"Make booking easier for everyone.",...(durationDays===undefined?{}:{durationDays})}))).status).toBe(200);
  expect(mocks.query.mock.calls[0][1]).toEqual(["all","Clearer booking","Make booking easier for everyone.",durationDays??7]);
});
it.each([0,91,1.5,"7"])("rejects invalid publication duration %s",async durationDays=>{
  expect((await publish(request({type:"feature",audience:"all",title:"Clearer booking",description:"Make booking easier for everyone.",durationDays}))).status).toBe(400);expect(mocks.query).not.toHaveBeenCalled();
});
