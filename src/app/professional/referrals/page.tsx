import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { professionalReferralSummary } from "@/modules/referrals/repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "Professional referrals" };

export default async function ReferralsPage() {
  const result = await pageAccount("professional");
  if (!result.account) {
    return <AuthFrame><AccessMessage code={result.error} /></AuthFrame>;
  }

  const summary = await withIdentity(result.account.authId, (db) =>
    professionalReferralSummary(db, result.account!.professionalId!),
  );
  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://www.glohaus.shop";
  const referralLink = `${origin.replace(/\/$/, "")}/r/${summary.code}`;

  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={result.account.displayName} />
      <main id="main" className="pro-main">
        <section className="pro-welcome">
          <div>
            <p className="pro-kicker">REFERRALS</p>
            <h1>Grow your GLOHAUS community.</h1>
            <p>Share your personal link or code. A referral counts after the new person finishes creating their GLOHAUS account.</p>
          </div>
        </section>

        <section className="pro-panel">
          <p className="pro-kicker">YOUR REFERRAL CODE</p>
          <h2>{summary.code}</h2>
          <p><a href={referralLink}>{referralLink}</a></p>
          <small>Self-referrals and duplicate account attribution do not count.</small>
        </section>

        <section className="pro-stat-grid" aria-label="Referral totals">
          <article><strong>{summary.totalReferrals}</strong><span>Total referrals</span></article>
          <article><strong>{summary.customerReferrals}</strong><span>Customer referrals</span></article>
          <article><strong>{summary.professionalReferrals}</strong><span>Professional referrals</span></article>
          <article><strong>{summary.lastReferralAt ? new Date(summary.lastReferralAt).toLocaleDateString("en-GB") : "—"}</strong><span>Last referral</span></article>
        </section>

        <section className="pro-panel">
          <h2>How it works</h2>
          <p>Share your link on TikTok, Instagram, WhatsApp or anywhere you promote your business. If someone follows the link and later completes a GLOHAUS account, the referral is assigned to you automatically for up to 30 days.</p>
        </section>
      </main>
    </div>
  );
}
