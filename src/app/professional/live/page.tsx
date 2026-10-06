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
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">GLOHAUS LIVE</p>
        <h1>Share your craft, live.</h1>
        <p className="pro-page-lead">
          Bring your audience into your studio for a tutorial, a new look or a conversation.
        </p>
        {eligibility.eligible ? (
          <LiveBroadcast host enabled={liveKitReady()} />
        ) : (
          <section className="pro-panel pro-eligibility-panel">
            <h2>LIVE is still locked.</h2>
            <p>Complete the requirements below before starting a broadcast.</p>
            <div className="pro-requirement-list">
              <p data-complete={eligibility.followers >= eligibility.followersRequired}>
                Followers <strong>{eligibility.followers} / {eligibility.followersRequired}</strong>
              </p>
              <p data-complete={eligibility.completedBookings >= eligibility.completedBookingsRequired}>
                Completed bookings <strong>{eligibility.completedBookings} / {eligibility.completedBookingsRequired}</strong>
              </p>
              <p data-complete={eligibility.verified}>
                Identity verification <strong>{eligibility.verified ? "Complete" : "Required"}</strong>
              </p>
              <p data-complete={eligibility.goodStanding}>
                Account standing <strong>{eligibility.goodStanding ? "Good" : "Restricted"}</strong>
              </p>
              <p data-complete={!eligibility.seriousModerationRestriction}>
                Moderation status <strong>{eligibility.seriousModerationRestriction ? "Restriction active" : "Clear"}</strong>
              </p>
            </div>
            <div className="pro-inline-actions">
              {!eligibility.verified && (
                <Link className="pro-pink-button" href="/professional/profile#verification">
                  Verify identity
                </Link>
              )}
              <Link href="/professional">Return to dashboard</Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
