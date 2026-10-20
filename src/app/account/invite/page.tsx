import Link from "next/link";
import { withAccount } from "@/lib/api-account";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { CustomerInviteActions } from "@/components/customer-invite-actions";

export const dynamic = "force-dynamic";
export const metadata = {title:"Invite Friends | GLOHAUS"};
export default async function Page() {
  const result=await pageAccount("customer");
  if (!result.account) return <AuthFrame><AccessMessage code={result.error??undefined}/></AuthFrame>;
  const referrals = await withAccount("customer",async db =>
    (await db.query<{data:{code:string;totalReferrals:number;rewardsEnabled:boolean}}>(
      "SELECT beauty.my_customer_referrals() AS data"
    )).rows[0]?.data ?? null
  ).catch(()=>null);
  return <main id="main" style={{maxWidth:760,margin:"0 auto",padding:"clamp(20px,4vw,48px)"}}>
    <Link href="/account">← My account</Link>
    <section className="admin-detail-card" style={{padding:24,marginTop:24}}>
      <p className="eyebrow">GLOHAUS COMMUNITY</p><h1>Invite friends</h1>
      <p>Know someone who would enjoy discovering beauty professionals? Share GLOHAUS with them.</p>
      {referrals ? <>
        <p>Your code: <strong>{referrals.code}</strong></p>
        <p>{referrals.totalReferrals} accounts attributed to your code.</p>
        <CustomerInviteActions code={referrals.code}/>
      </> : <><CustomerInviteActions/><p>Personal referral codes are temporarily unavailable.</p></>}
      <p>Customer referrals are attributed only when a new account is successfully registered using your link. Financial rewards are not active.</p>
    </section>
  </main>;
}
