import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { LiveBroadcast } from "@/components/live-broadcast";
import { liveEligibility } from "@/modules/live/repository";
import { liveKitReady } from "@/modules/live/livekit";
export const dynamic = "force-dynamic";
export const metadata = { title: "Go LIVE · GLOHAUS PRO" };
export default async function Page() {
  const result = await pageAccount("professional");
  if (!result.account) return <div className="standalone-message"><AccessMessage code={result.error} /></div>;
  const account = result.account;
  if (!account.professionalId) return <Link href="/professional/setup">Create your professional profile</Link>;
  const eligibility = await withIdentity(account.authId, db => liveEligibility(db, account.professionalId!));
  return <div className="pro-app"><ProfessionalNavigation active="more" displayName={account.displayName} /><main id="main" className="pro-main pro-management-page"><p className="pro-kicker">GLOHAUS LIVE</p><h1>Share your craft, live.</h1><p>Bring your audience into your studio for a tutorial, a new look or a conversation.</p>{eligibility.eligible ? <LiveBroadcast host enabled={liveKitReady()} /> : <section className="pro-panel"><h2>Keep building your community</h2><p>Followers: {eligibility.followers} / {eligibility.followersRequired}. Completed bookings: {eligibility.completedBookings} / {eligibility.completedBookingsRequired}.</p><p>Verification and good account standing are also required.</p><Link href="/professional">Return to your dashboard</Link></section>}</main></div>;
}
