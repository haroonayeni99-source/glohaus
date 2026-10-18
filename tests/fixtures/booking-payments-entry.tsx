// Fictional browser fixtures. Actual reservation and finance behaviour is tested in PostgreSQL.
import React from "react";
import { createRoot } from "react-dom/client";
import { BookingPicker } from "@/components/booking-picker";
import { ProfessionalPolicyEditor } from "@/components/professional-policy-editor";
import { defaultPolicy } from "@/modules/policies/domain";
const params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get("theme")??"light";
const mode=params.get("mode");
const id="11111111-1111-4111-8111-111111111111";
const start=new Date(Date.now()+20*86400000);start.setUTCHours(12,0,0,0);const startsAt=start.toISOString();
window.fetch=async(url,init)=>{
 const path=String(url);const requests=JSON.parse(sessionStorage.getItem("payment-requests")||"[]");requests.push({url:path,body:init?.body?JSON.parse(String(init.body)):null});sessionStorage.setItem("payment-requests",JSON.stringify(requests));
 if(path.includes("/policies?")){
  const choice=new URL(path,location.origin).searchParams.get("paymentChoice");const full=mode==="starter"||mode==="required"||choice==="full";
  return Response.json({policy:{token:(full?"f":"d").repeat(32),generalVersionId:null,serviceVersionId:null,rules:defaultPolicy,generalCustomRules:"",serviceCustomRules:"",timezone:"Europe/London",pricePence:5000,depositPence:full?5000:1500,bookingFeePence:100,fullPrepayment:full,paymentChoice:full?"full":"deposit",paymentRequirement:mode==="required"||mode==="starter"?"full":"deposit_or_full",requiredDepositPence:1500,fullPaymentReason:mode==="starter"?"starter":mode==="required"?"professional":full?"customer":null,publishedAt:null},earlyServiceBefore:new Date().toISOString()});
 }
 if(path.includes("/availability?"))return Response.json({slots:[startsAt]});
 if(init?.method==="POST"&&path==="/api/v1/bookings")return Response.json({error:{message:"Fixture: chosen payment recorded"}},{status:409});
 return Response.json({saved:true});
};
const root=createRoot(document.getElementById("root")!);
root.render(<main style={{maxWidth:720,margin:"20px auto",padding:16}}>{mode==="editor"?<ProfessionalPolicyEditor data={{scopes:[],versions:[],services:[{id,name:"Manicure"}]}}/>:<BookingPicker services={[{id,professional_id:"fixture-pro",name:"Manicure",description:"",duration_minutes:60,price_pence:5000,deposit_pence:mode==="starter"?0:1500}]} ready returnPath="/p/studio" professionalName="Beauty Studio" bookingFeePence={100} verificationStatus={mode==="starter"?"unverified":"verified"} initialSelection={{serviceId:id,date:startsAt.slice(0,10),startsAt}}/>}</main>);
