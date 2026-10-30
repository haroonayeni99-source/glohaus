import "server-only";
import {z} from "zod";
import {withPaymentWorker} from "@/modules/payments/worker";
const readyEmail=z.object({id:z.uuid(),email:z.email(),businessName:z.string().nullable(),slug:z.string().min(1),unsubscribeToken:z.uuid()});
type Mailer=(message:{from:string;to:string;subject:string;text:string;headers:Record<string,string>;tags:{name:string;value:string}[]},options:{idempotencyKey:string})=>Promise<{data?:{id:string}|null;error?:unknown}>;
export async function deliverRebookingEmails(send:Mailer,appUrl:string,from:string){
 const installed=await withPaymentWorker(async db=>(await db.query<{installed:boolean}>("SELECT to_regprocedure('beauty.prepare_rebooking_emails()') IS NOT NULL AS installed")).rows[0]?.installed===true);
 if(!installed)return {installed:false,claimed:0,sent:0,skipped:0,retrying:0};
 await withPaymentWorker(db=>db.query("SELECT beauty.prepare_rebooking_emails()"));
 const jobs=await withPaymentWorker(async db=>(await db.query<{id:string}>("SELECT * FROM beauty.claim_rebooking_emails()")).rows);
 let sent=0,skipped=0,retrying=0;
 for(const job of jobs){try{
  // Recheck consent, suppression, booking/account state and the emergency stop immediately before sending.
  const value=await withPaymentWorker(async db=>(await db.query<{data:unknown}>("SELECT beauty.rebooking_email_before_send($1) AS data",[job.id])).rows[0]?.data);
  if(value===null||value===undefined){skipped++;continue;}
  const message=readyEmail.parse(value);
  if(message.id!==job.id)throw Error("REBOOKING_JOB_MISMATCH");
  const booking=new URL(`/p/${encodeURIComponent(message.slug)}`,appUrl).href;
  const unsubscribe=new URL(`/marketing/unsubscribe?token=${encodeURIComponent(message.unsubscribeToken)}`,appUrl).href;
  const result=await send({from,to:message.email,subject:"Ready to book your next beauty appointment?",text:`You opted in to GLOHAUS rebooking reminders. If you would like another appointment${message.businessName?` with ${message.businessName}`:""}, you can review the current services and availability here:\n\n${booking}\n\nNo appointment has been reserved. Prices and availability are shown before you book.\n\nGLOHAUS · Look Good. Feel Good. Stand Out.\nOptional marketing: unsubscribe at ${unsubscribe}\nContact: https://www.glohaus.shop/contact`,headers:{"List-Unsubscribe":`<${unsubscribe}>`},tags:[{name:"glohaus_rebooking_id",value:message.id}]}, {idempotencyKey:`glohaus-rebooking-${message.id}`});
  if(result.error||!result.data?.id)throw Error("REBOOKING_DELIVERY_FAILED");
  await withPaymentWorker(db=>db.query("SELECT beauty.finish_rebooking_email($1,$2)",[job.id,result.data!.id]));sent++;
 }catch{retrying++;await withPaymentWorker(db=>db.query("SELECT beauty.finish_rebooking_email($1,$2)",[job.id,null]));}}
 return {installed:true,claimed:jobs.length,sent,skipped,retrying};
}
