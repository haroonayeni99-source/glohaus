import {z} from "zod";
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).regex(/^[^\x00-\x1f]*$/);
const reason=text(5,300);
export const academyAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("remove"),id:z.uuid(),professionalId:z.uuid(),reason}).strict(),
 z.object({action:z.literal("create"),academy:text(2,120),cohort:text(2,120),reason}).strict(),
 z.object({action:z.literal("state"),id:z.uuid(),state:z.enum(["draft","active","closed"]),reason}).strict(),
 z.object({action:z.literal("add"),id:z.uuid(),professionalId:z.uuid(),permissionEvidence:text(5,300),reason}).strict(),
]);
export type AcademyOverview={cohorts:{id:string;academy_name:string;cohort_name:string;state:"draft"|"active"|"closed"}[];members:{cohortId:string;professionalId:string;businessName:string|null;joinedAt:string;published:boolean;services:boolean;availability:boolean;completedPaidBookings:number}[]};
