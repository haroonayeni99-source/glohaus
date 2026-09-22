import Link from "next/link";
import { Star } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { professionalReviews } from "@/modules/reviews/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your reviews" };
export default async function Reviews() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const { reviews, totals } = await withIdentity(account.authId, (db) =>
    professionalReviews(db, account.professionalId!),
  );
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-list-page">
        <Link className="pro-back-link" href="/professional">← Dashboard</Link>
        <p className="pro-kicker">FEEDBACK FROM REAL APPOINTMENTS</p>
        <h1>Your work, in their words.</h1>
        <div className="pro-stat-grid pro-review-summary">
          <article>
            <strong>
              {totals.average === null
                ? "—"
                : `${totals.average.toFixed(1)} / 5`}
            </strong>
            <span>Average visible review</span>
          </article>
          <article>
            <strong>{totals.count}</strong>
            <span>Visible appointment reviews</span>
          </article>
        </div>
        <p className="pro-page-lead">
          Only customers with completed appointments can leave a review. Reviews
          hidden by moderation do not appear on your public profile.
        </p>
        {reviews.length ? (
          <section className="pro-review-list">
            {reviews.map((review) => (
              <article key={review.id}>
              <div className="pro-panel-title">
                <strong>
                  <Star size={16} aria-hidden /> {review.rating}/5 ·{" "}
                  {review.public_name}
                </strong>
                <span className="pro-status pro-status-confirmed">
                  {review.moderation_status === "visible"
                    ? "Visible"
                    : "Hidden by moderation"}
                </span>
              </div>
              <p>{review.body}</p>
              <p>
                <small>
                  {review.service_name} ·{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Europe/London",
                    dateStyle: "medium",
                  }).format(new Date(review.created_at))}
                </small>
              </p>
              <Link href={`/account/bookings/${review.booking_id}`}>View appointment →</Link>
            </article>
            ))}
          </section>
        ) : (
          <section className="pro-empty-state pro-large-empty">
            <Star size={32} aria-hidden />
            <h2>Your first review starts with a great appointment.</h2>
            <p>
              After a completed visit, your customer can share their experience.
              Their feedback will appear here.
            </p>
            <Link href="/professional/bookings">
              View appointments →
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
