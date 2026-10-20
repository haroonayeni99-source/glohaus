import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { CustomerInviteActions } from "@/components/customer-invite-actions";

export const dynamic = "force-dynamic";
export const metadata = {title:"Invite Friends | GLOHAUS"};
export default async function Page() {
  const result=await pageAccount("customer");
  if (!result.account) return <AuthFrame><AccessMessage code={result.error??undefined}/></AuthFrame>;
  return <main id="main" style={{maxWidth:760,margin:"0 auto",padding:"clamp(20px,4vw,48px)"}}>
    <Link href="/account">← My account</Link>
    <section className="admin-detail-card" style={{padding:24,marginTop:24}}>
      <p className="eyebrow">GLOHAUS COMMUNITY</p><h1>Invite friends</h1>
      <p>Know someone who would enjoy discovering beauty professionals? Share GLOHAUS with them.</p>
      <CustomerInviteActions/>
      <p>Customer referral codes and rewards are not active yet. Sharing this link does not track who signs up and does not earn credit.</p>
    </section>
  </main>;
}
