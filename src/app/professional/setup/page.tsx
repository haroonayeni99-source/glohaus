export const dynamic = "force-dynamic";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
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
      "/professional/profile#services",
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
      "Share your craft",
      "Publish your page and create posts and tutorials.",
      "/professional/posts",
      progress.profile.published,
    ],
  ] as const;
  const complete = steps.filter((step) => step[3]).length;
  const progressPercent = Math.round((complete / steps.length) * 100);
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link className="back-link" href="/professional">
          ← Your workspace
        </Link>
        <p className="eyebrow">
          PROFESSIONAL SETUP · {complete} OF {steps.length} READY
        </p>
        <h1>
          Build your page, <em>one simple step at a time.</em>
        </h1>
        <p className="lead">
          You control what becomes public. Complete the essentials, then share
          your work when you are ready.
        </p>
        <section className="setup-progress" aria-label="Setup progress">
          <div>
            <span className="eyebrow">YOUR PAGE PROGRESS</span>
            <strong>{progressPercent}% ready to share</strong>
          </div>
          <progress value={complete} max={steps.length}>
            {progressPercent}%
          </progress>
          <p>
            Complete the first four steps to create a confident public booking
            page. You can return to this checklist whenever you need to.
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
    </>
  );
}
