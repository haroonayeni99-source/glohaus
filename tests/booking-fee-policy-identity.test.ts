import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/policies/route";
const mocks=vi.hoisted(()=>({identity:vi.fn(),withIdentity:vi.fn()}));
vi.mock("@/lib/identity",()=>({getIdentity:mocks.identity}));
vi.mock("@/lib/db",()=>({withIdentity:mocks.withIdentity}));
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.identity.mockResolvedValue({authId:"verified-customer"});
 mocks.withIdentity.mockImplementation(async(auth:string,work:(db:unknown)=>Promise<unknown>)=>work({query:async(sql:string)=>({rows:[sql.includes("cooling_off")?{cutoff:new Date("2026-11-01T00:00:00Z")}:{data:{bookingFeePence:auth?100:150,referralDiscountPence:auth?50:0}}]})}));
});
const url="https://glohaus.test/api/v1/policies?serviceId=11111111-1111-4111-8111-111111111111";
it("quotes using the verified identity and ignores supplied customer identifiers",async()=>{
 const response=await GET(new Request(url+"&authId=another-user&customerId=another-user"));
 expect(response.status).toBe(200);
 expect(mocks.withIdentity.mock.calls[0][0]).toBe("verified-customer");
 expect((await response.json()).policy).toMatchObject({bookingFeePence:100,referralDiscountPence:50});
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("keeps guest previews available at the standard fee",async()=>{
 mocks.identity.mockRejectedValue(new Error("No verified session"));
 const response=await GET(new Request(url));
 expect(mocks.withIdentity.mock.calls[0][0]).toBe("");
 expect((await response.json()).policy.bookingFeePence).toBe(150);
});
it("rejects invalid service requests before identity or database access",async()=>{
 const response=await GET(new Request("https://glohaus.test/api/v1/policies?serviceId=invalid"));
 expect(response.status).toBe(400);
 expect(mocks.identity).not.toHaveBeenCalled();
 expect(mocks.withIdentity).not.toHaveBeenCalled();
});
