import {z} from "zod";
export const rebookingSettings=z.object({enabled:z.boolean(),delayDays:z.number().int().min(14).max(180),cooldownDays:z.number().int().min(7).max(180),dailyCap:z.number().int().min(0).max(500),monthlyCap:z.number().int().min(0).max(5000),reason:z.string().trim().min(5).max(300)}).strict();
export type RebookingOverview={settings:{enabled:boolean;delay_days:number;cooldown_days:number;daily_cap:number;monthly_cap:number};counts:{pending:number;sent:number;suppressed:number;failed:number};eligibleNow:number};
