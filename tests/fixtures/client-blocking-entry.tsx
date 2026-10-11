import React from "react";
import { createRoot } from "react-dom/client";
import { ProfessionalClientDirectory } from "@/components/professional-client-directory";
import { CustomerProfileEditor } from "@/components/customer-profile-editor";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { EmailAuthForm } from "@/components/email-auth-form";
const id="11111111-1111-4111-8111-111111111111";
const params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get("theme")??"light";
localStorage.setItem("glohaus-theme",document.documentElement.dataset.theme);
window.fetch=async(url,init)=>{
 const items=JSON.parse(sessionStorage.getItem("client-requests")??"[]");items.push({url:String(url),method:init?.method??"GET",body:init?.body});sessionStorage.setItem("client-requests",JSON.stringify(items));
 if(sessionStorage.getItem("client-fail")==="1"){sessionStorage.removeItem("client-fail");return Response.json({error:{code:"UNAVAILABLE"}},{status:503});}
 if(String(url).includes("/professional/clients/"))return Response.json(JSON.parse(String(init?.body)));
 return Response.json({saved:true});
};
const clients=[{customer_id:id,customer_name:"Alexandra Longfirstname Longsurname",appointment_count:2,last_appointment_at:new Date("2026-10-01"),next_appointment_at:new Date("2026-10-20"),has_photo:true,blocked:false}];
const content=location.pathname==="/professional/clients"?<ProfessionalClientDirectory clients={params.get("q")==="missing"||params.get("view")==="blocked"?[]:clients} options={{q:params.get("q")??"",view:params.get("view")??""}} displayName="Test Professional"/>:location.pathname==="/sign-up"?<main id="main" className="customer-account-page"><EmailAuthForm mode="sign-up" redirectTo="/account"/></main>:<><PublicHeader signedIn/><main id="main" className="customer-account-page"><h1>Help your professional recognise you.</h1><CustomerProfileEditor userId={id} profile={{first_name:"Alexandra",last_name:"",has_photo:false}}/></main><BottomNavigation active="profile" signedIn/></>;
createRoot(document.getElementById("root")!).render(content);
