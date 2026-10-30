export const referralChannels=["customer","professional-to-professional","professional-introducing-own-customer","manual-partner"] as const;
export type ReferralChannel=typeof referralChannels[number];
export type ReferralLink={code:string;channel:ReferralChannel};
export function referralLink(code:unknown,channel?:unknown):ReferralLink|null {
 if(typeof code!=="string")return null;const normalized=code.trim().toUpperCase();
 if(!/^(?:G[RP][A-F0-9]{32}|GC[A-F0-9]{16}|GH[A-Z0-9]{6,12})$/.test(normalized))return null;
 const selected=channel??(normalized.startsWith("GP")?"manual-partner":normalized.startsWith("GH")?"professional-to-professional":"customer");
 return referralChannels.includes(selected as ReferralChannel)?{code:normalized,channel:selected as ReferralChannel}:null;
}
export function referralPath(link:ReferralLink){return `/r/${encodeURIComponent(link.code)}?channel=${encodeURIComponent(link.channel)}`;}
export function referralCookie(value:string|undefined):ReferralLink|null {try{const data=JSON.parse(value??"null");return referralLink(data?.code,data?.channel);}catch{return null;}}
