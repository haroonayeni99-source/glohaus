export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import type { FeatureVoteItem } from "@/lib/feature-voting";
import { FeatureVotes } from "@/components/feature-votes";

export default async function FeatureVotesPage() {
  const result = await pageAccount();
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const account = result.account;
  const professional = account.roles.includes("professional");

  let features: FeatureVoteItem[] = [];
  let featureLoadUnavailable = false;

  try {
    features = await withIdentity(account.authId, async (db) =>
      (
        await db.query<FeatureVoteItem>(
          "SELECT * FROM beauty.feature_vote_results()",
        )
      ).rows.map(item => ({ ...item, closes_at: new Date(item.closes_at).toISOString() })),
    );
  } catch (error) {
    featureLoadUnavailable = true;
    console.error("Feature voting list unavailable", {
      type: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "",
    });
  }

  const visible = features.filter(
    (item) =>
      item.audience === "all" ||
      (professional
        ? item.audience === "professional"
        : item.audience === "customer"),
  );

  const content = (
    <main
      id="main"
      className={
        professional
          ? "pro-main pro-management-page"
          : "customer-account-page"
      }
    >
      <p className="eyebrow">HELP SHAPE GLOHAUS</p>
      <h1>Vote on what you want next.</h1>
      <p className="lead">
        Vote totals are public to signed-in GLOHAUS users, but who voted remains
        private. Choose Like or Dislike before the end time. One account gets one
        choice per idea; pick it again to remove it. Final results stay visible.
      </p>
      {featureLoadUnavailable ? (
        <section className="feature-vote-list" aria-live="polite">
          <p className="lead">
            Feature voting is temporarily unavailable. Your account is still
            connected, so you can retry this page without losing anything.
          </p>
        </section>
      ) : (
        <FeatureVotes initial={visible} />
      )}
    </main>
  );

  return professional ? (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      {content}
    </div>
  ) : (
    <>
      <PublicHeader signedIn />
      {content}
    </>
  );
}
