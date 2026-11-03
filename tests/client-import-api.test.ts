import {beforeEach,expect,it,vi} from "vitest";
import {AccessError} from "@/modules/accounts/domain";
const mocks=vi.hoisted(()=>({query:vi.fn(),role:"professional",allowed:true}));
vi.mock("@/lib/api-account",()=>({withAccount:async(role:string,work:(db:object)=>unknown)=>{if(!mocks.allowed)throw new AccessError("UNAUTHENTICATED",401);if(role!==mocks.role)throw new AccessError("FORBIDDEN",403);return work({query:mocks.query});}}));
import {POST,DELETE} from "@/app/api/v1/professional/client-imports/route";
const row={name:"Client",email:"client@example.test",import_permission:true,permission_date:"2026-01-01",permission_source:"Written permission"};
const req=(body:unknown,origin="https://glohaus.test")=>new Request("https://glohaus.test/api/v1/professional/client-imports",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.allowed=true;mocks.role="professional";mocks.query.mockResolvedValue({rows:[{data:{imported:1,skipped:0}}]});});
it("requires a signed-in professional",async()=>{mocks.allowed=false;expect((await POST(req({rows:[row],confirmed:true}))).status).toBe(401);mocks.allowed=true;mocks.role="customer";expect((await POST(req({rows:[row],confirmed:true}))).status).toBe(403);expect(mocks.query).not.toHaveBeenCalled();});
it("blocks cross-origin writes and unconfirmed or injected permissions before SQL",async()=>{
 expect((await POST(req({rows:[row],confirmed:true},"https://attacker.test"))).status).toBe(403);
 for(const body of [{rows:[row],confirmed:false},{rows:[{...row,marketing_consent:true}],confirmed:true},{rows:[row],confirmed:true,professionalId:"other"}])expect((await POST(req(body))).status).toBe(400);
 expect(mocks.query).not.toHaveBeenCalled();
});
it("uses only the narrow import function and keeps responses uncached",async()=>{const response=await POST(req({rows:[row],confirmed:true}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(mocks.query).toHaveBeenCalledOnce();expect(JSON.parse(mocks.query.mock.calls[0][1][0])).toEqual([{...row,phone:""}]);});
it("requires explicit deletion confirmation and reports the contact cap",async()=>{
 expect((await DELETE(req({id:"00000000-0000-4000-8000-000000000001",confirmed:false}))).status).toBe(400);expect(mocks.query).not.toHaveBeenCalled();
 mocks.query.mockRejectedValueOnce({code:"22023",message:"IMPORT_LIMIT_REACHED"});expect((await POST(req({rows:[row],confirmed:true}))).status).toBe(409);
});
