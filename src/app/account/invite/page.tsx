import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { withAccount } from "@/lib/api-account";
import { claimReferral } from "./referral-action";
import { CustomerInviteActions } from "@/components/customer-invite-actions";

export const dynamic = "force-dynamic";
export const metadata = {title:"Invite Friends | GLOHAUS"};
export default async function Page({searchParams}:{searchParams:Promise<{claim?:string;ref?:string}>}) {
  const result=await pageAccount("customer");
  if (!result.account) return <AuthFrame><AccessMessage code={result.error??undefined}/></AuthFrame>;
  const referral=await withAccount("customer",async db => (await db.query<{data:{code:string;totalReferrals:number;rewardsEnabled:boolean}}>("SELECT beauty.my_customer_referrals() AS data")).rows[0]?.data).catch(()=>null);
  const { claim, ref } = await searchParams;
  const invitedCode = typeof ref === "string" && /^GC[A-F0-9]{16}$/i.test(ref) ? ref.toUpperCase() : "";
  return <main id="main" style={{maxWidth:760,margin:"0 auto",padding:"clamp(20px,4vw,48px)"}}>
    <Link href="/account">← My account</Link>
    <section className="admin-detail-card" style={{padding:24,marginTop:24}}>
      <p className="eyebrow">GLOHAUS COMMUNITY</p><h1>Invite friends</h1>
      <p>Know someone who would enjoy discovering beauty professionals? Share GLOHAUS with them.</p>
      {referral ? <>
        <p>Your code: <strong>{referral.code}</strong></p>
        <p>{referral.totalReferrals} attributed registration(s). Rewards disabled.</p>
        <CustomerInviteActions code={referral.code}/>
      </> : <p role="alert">Referral codes are temporarily unavailable.</p>}
      <form action={claimReferral} style={{marginTop:20}}>
        <label htmlFor="claim-referral">Received a referral code? Claim within 24 hours of joining.</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input id="claim-referral" name="code" defaultValue={invitedCode} minLength={18} maxLength={18} pattern="GC[A-Fa-f0-9]{16}" placeholder="GC…" required />
          <button type="submit" className="button small">Claim invitation</button>
        </div>
      </form>
      {claim==="success"&&<p role="status">Invitation registered. No rewards have been issued.</p>}
      {claim==="unavailable"&&<p role="alert">Code not accepted. It may be invalid, expired, already claimed or your own.</p>}
      <p>Attribution records valid account claims only. Referral incentives are currently disabled.</p>
    </section>
  </main>;
}
