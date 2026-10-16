import { timingSafeEqual } from "node:crypto";
import { runNotificationWorker } from "@/modules/notifications/worker";
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 const actual=Buffer.from(request.headers.get("authorization")||"");
 const expected=Buffer.from(`Bearer ${secret||""}`);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response("Unauthorized",{status:401});
 return runNotificationWorker();
}
