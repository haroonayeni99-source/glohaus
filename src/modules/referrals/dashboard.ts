import type {ReferralChannel} from "./links";
export const channelLabels:Record<ReferralChannel,string>={customer:"Customer referrals","professional-to-professional":"Professional to professional","professional-introducing-own-customer":"Professionals introducing their customers","manual-partner":"Manual partners"};
export type ReferralRule={channel:ReferralChannel;amount_pence:number;hold_days:number;person_monthly_cap:number;channel_monthly_cap:number|null;minimum_net_pence:number;maximum_share_bps:number;enabled:boolean};
export type ReferralDashboard={
 asOf:string;controls:{monthly_budget_pence:number|null;emergency_stop:boolean;launch_approved:boolean};rules:ReferralRule[];
 channels:{channel:ReferralChannel;signups:number;newActiveProfessionals:number;genuineNewCustomers:number;qualifyingBookings:number;repeatBookings:number;retainedNetPence:number;wouldEarnPence:number;flaggedCases:number;reversedRewards:number;costsPending:number}[];
 partners:{id:string;label:string;code:string;recipient:string}[];recipients:{id:string;display_name:string;email:string}[];
 risks:{id:string;reason:string;referred_name:string;referrer_name:string;status:string}[];
 rewards:{id:string;booking_id:string;rule_id:string;channel:ReferralChannel;amount_pence:number;retained_net_pence:number;created_at:string;earner:string;status:string;history:{status:string;created_at:string;reason:string;actor:string|null}[]}[];
 settingsHistory:{kind:string;channel:ReferralChannel|null;created_at:string;actor:string|null;reason:string}[];
};
export function penceInput(value:FormDataEntryValue|null):number|null{
 if(typeof value!=="string"||!/^\d{1,8}(?:\.\d{1,2})?$/.test(value))return null;const[pounds,pence=""]=value.split(".");return Number(pounds)*100+Number(pence.padEnd(2,"0"));
}
