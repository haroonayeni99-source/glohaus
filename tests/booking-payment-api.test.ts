import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/bookings/route";
const mocks=vi.hoisted(()=>({account:vi.fn(),query:vi.fn(),create:vi.fn()}));
vi.mock("@/lib/api-account",()=>({withAccount:mocks.account}));
vi.mock("@/modules/professionals/verification",()=>({professionalAccessState:async()=>({verified:true}),assertBookingAllowed:vi.fn()}));
vi.mock("@/modules/payments/stripe",()=>({paymentReady:()=>true,stripe:()=>({checkout:{sessions:{create:mocks.create}}})}));
const service="11111111-1111-4111-8111-111111111111";
const booking="22222222-2222-4222-8222-222222222222";
let amount=5000;
let accepted=true;
const request=(extra={})=>new Request("https://glohaus.test/api/v1/bookings",{method:"POST",headers:{origin:"https://glohaus.test","content-type":"application/json"},body:JSON.stringify({serviceId:service,startsAt:new Date(Date.now()+86400000*20).toISOString(),acceptPolicy:true,policyToken:"a".repeat(32),earlyServiceRequested:true,paymentChoice:"full",...extra})});
beforeEach(()=>{
 vi.resetAllMocks();amount=5000;accepted=true;
 mocks.account.mockImplementation((_role,work)=>work({query:mocks.query}));
 mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes("public_services")?[{professional_id:"pro",price_pence:5000,deposit_pence:2000}]:sql.includes("reserve_booking")?[{booking:{id:booking,depositPence:amount,pricePence:5000,serviceName:"Manicure",professionalName:"Studio",status:"payment_pending",holdExpiresAt:new Date(Date.now()+1800000).toISOString()}}]:sql.includes("accepted_policy")?[{price_pence:5000,deposit_pence:amount,professional_id:"pro",accepted_policy:accepted?{fullPrepayment:amount===5000,pricePence:5000,depositPence:amount}:null}]:sql.includes("prepare_booking_financial_quote")?[{quote:{customerTotalPence:amount+100,customerPlatformFeePence:100,professionalPlatformFeePence:750,professionalProceedsPence:amount-750}}]:[]}));
 mocks.create.mockResolvedValue({id:"cs_fixture",url:"https://checkout.stripe.com/c/pay/cs_fixture"});
});
it("passes the chosen payment through the authorised reservation and charges full price plus one fee",async()=>{
 expect((await POST(request())).status).toBe(201);
 expect(mocks.query).toHaveBeenCalledWith("SELECT beauty.reserve_booking_with_payment($1,$2,$3,$4,$5,$6,$7) AS booking",expect.arrayContaining([service,null,[],"full"]));
 const args=mocks.create.mock.calls[0][0];expect(args.line_items.map((i:{price_data:{unit_amount:number}})=>i.price_data.unit_amount)).toEqual([5000,100]);
 expect(args.line_items[0].price_data.product_data.name).toContain("Service payment");
 expect(args.cancel_url).toContain("glohaus.test");
});
it("keeps the original deposit checkout available",async()=>{
 amount=2000;expect((await POST(request({paymentChoice:"deposit"}))).status).toBe(201);
 expect(mocks.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(2000);
});
it("refuses a full amount without an accepted full-payment snapshot",async()=>{
 accepted=false;expect((await POST(request())).status).toBe(503);expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects caller-supplied amounts and invalid payment modes",async()=>{
 for(const extra of [{amountPence:1},{paymentChoice:"cash"}]) expect((await POST(request(extra))).status).toBe(400);
 expect(mocks.create).not.toHaveBeenCalled();
});
