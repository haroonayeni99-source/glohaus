export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { AccessMessage } from "@/components/access-message";

export const metadata = { title: "Set up your professional page" };

export default async function ProfessionalSetup() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const progress = await withIdentity(account.authId, async (db) => {
    const profile = (
      await db.query<{ complete: boolean; published: boolean }>(
        "SELECT slug IS NOT NULL AND length(business_name)>=2 AND length(bio)>=20 AND length(city)>=2 AS complete,publication_status='published' AS published FROM beauty.professional_profiles WHERE id=$1",
        [account.professionalId],
      )
    ).rows[0];
    const access = (
      await db.query<{
        data: {
          status: "unverified" | "pending" | "verified" | "restricted";
          verified: boolean;
          starterBookingsUsed: number;
          starterBookingsRemaining: number | null;
        };
      }>("SELECT beauty.professional_access_state($1) AS data", [
        account.professionalId,
      ])
    ).rows[0].data;
    const [services, availability, portfolio] = await Promise.all([
      db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM beauty.services WHERE professional_id=$1 AND active",
        [account.professionalId],
      ),
      db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM beauty.availability_rules WHERE professional_id=$1",
        [account.professionalId],
      ),
      db.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM beauty.portfolio_assets WHERE professional_id=$1 AND publication_status='published'",
        [account.professionalId],
      ),
    ]);
    return {
      profile,
      services: services.rows[0].count,
      availability: availability.rows[0].count,
      portfolio: portfolio.rows[0].count,
      verification: access,
    };
  });
  const steps = [
    [
      "Your professional page",
      "Business name, profile image, location and client contact preferences.",
      "/professional/profile",
      progress.profile.complete,
    ],
    [
      "Services and prices",
      "Create your bookable menu, durations and deposits.",
      "/professional/services",
      progress.services > 0,
    ],
    [
      "Working hours",
      "Set bookable times and keep time off protected.",
      "/professional/availability",
      progress.availability > 0,
    ],
    [
      "Portfolio",
      "Upload work you have permission to share, then publish it.",
      "/professional/portfolio",
      progress.portfolio > 0,
    ],
    [
      "Publish your page",
      "Make your professional page visible so customers can discover your services and portfolio.",
      "/professional/profile",
      progress.profile.published,
    ],
  ] as const;
  const complete = steps.filter((step) => step[3]).length;
  const progressPercent = Math.round((complete / steps.length) * 100);
  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="more"
        displayName={account.displayName}
      />
      <main id="main" className="pro-main pro-management-page">
        <Link className="back-link" href="/professional">
          ← Your workspace
        </Link>
        <p className="eyebrow">
          PROFESSIONAL SETUP · {complete} OF {steps.length} CORE STEPS READY
        </p>
        <h1>
          Build your page, <em>one simple step at a time.</em>
        </h1>
        <p className="lead">
          You control what becomes public. Complete the essentials, then share
          your work when you are ready.
        </p>
        <div className="editor-actions">
          <Link className="text-link setup-preview-link" href="/professional-preview">
            See a GLOHAUS PRO page preview <ArrowUpRight size={17} aria-hidden />
          </Link>
          <Link className="text-link setup-preview-link" href="/professional/plans">
            Review plans, commission and withdrawal fees <ArrowUpRight size={17} aria-hidden />
          </Link>
        </div>
        <section className="pro-panel" aria-label="Verification status">
          <div className="pro-panel-title">
            <h2>Verification status</h2>
            <span className="pro-status pro-status-confirmed">
              {progress.verification.status === "verified"
                ? "Verified"
                : progress.verification.status === "pending"
                  ? "Pending"
                  : progress.verification.status === "restricted"
                    ? "Restricted"
                    : "Unverified"}
            </span>
          </div>
          <p>
            {progress.verification.status === "verified"
              ? "Your verified marketplace features are unlocked, subject to your plan and account standing."
              : progress.verification.status === "pending"
                ? "Your verification is in progress. Your profile can stay in draft while Stripe completes any required checks."
                : progress.verification.status === "restricted"
                  ? "New paid marketplace activity is restricted while this account is reviewed."
                  : `You can start on Starter access without verification. You have ${progress.verification.starterBookingsRemaining ?? 0} of 5 starter bookings remaining. Unverified services are limited to £200 or less with no online deposit. Verification unlocks deposits, higher-value services, product selling and withdrawals.`}
          </p>
          {progress.verification.status !== "verified" &&
            progress.verification.status !== "restricted" && (
              <Link className="button small" href="/professional/profile#verification">
                {progress.verification.status === "pending"
                  ? "Continue verification"
                  : "Verify identity"}
              </Link>
            )}
        </section>

        <section className="pro-panel pro-verification-explainer" aria-label="GLOHAUS verification levels">
          <div className="pro-panel-title"><h2>What each verification badge means</h2></div>
          <div className="pro-verification-levels">
            <article><Check size={17} aria-hidden /><div><strong>Identity Verified</strong><span>Your identity/KYC checks have passed. You can be an individual or sole trader; this badge does not mean you have a registered company.</span></div></article>
            <article><Check size={17} aria-hidden /><div><strong>Business Verified</strong><span>For professionals using a registered company or business entity, the relevant business details have also been checked.</span></div></article>
            <article><Check size={17} aria-hidden /><div><strong>Professional Verified</strong><span>GLOHAUS has additionally reviewed relevant qualification, licence or professional evidence where applicable to your services.</span></div></article>
          </div>
          <p className="pro-tax-note-inline">You remain responsible for registering with HMRC where required and for your own tax, National Insurance, VAT and other obligations. <Link href="/professional-terms">Read Professional Terms →</Link></p>
        </section>

        <section className="setup-progress" aria-label="Setup progress">
          <div>
            <span className="eyebrow">YOUR PAGE PROGRESS</span>
            <strong>{progressPercent}% ready to share</strong>
          </div>
          <progress value={complete} max={steps.length}>
            {progressPercent}%
          </progress>
          <p>
            This progress tracks the core steps needed to make your professional
            page usable. Identity verification is optional for Starter access
            and does not reduce your setup percentage. Unverified services are
            limited to £200 or less, no online deposit, and up to five starter
            bookings. Verification unlocks the wider marketplace features.
          </p>
        </section>
        <section
          className="service-edit-list setup-steps"
          aria-label="Professional setup steps"
        >
          {steps.map(([title, text, href, done], index) => (
            <article
              key={title}
              className={`service-edit-row setup-step ${done ? "is-complete" : ""}`}
            >
              <span className="setup-step-number" aria-hidden>
                {done ? <Check size={17} /> : String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="eyebrow">STEP {index + 1}</p>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
              <div className="editor-actions">
                <span className="pill">
                  {done ? (
                    <>
                      <Check size={15} /> Ready
                    </>
                  ) : (
                    <>
                      <Circle size={15} /> To do
                    </>
                  )}
                </span>
                <Link className="button small" href={href}>
                  {done ? "Edit" : "Continue"}
                </Link>
              </div>
            </article>
          ))}
        </section>
        <Link className="button" href="/professional">
          Go to your business workspace
        </Link>
      </main>
    </div>
  );
}
