import Link from "next/link";
import { Star } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "My reviews" };
export default async function ReviewsPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const reviews = await withIdentity(
    account.authId,
    async (db) =>
      (
        await db.query<{
          id: string;
          booking_id: string;
          rating: number;
          body: string;
          service_name: string;
          professional_name: string;
          created_at: Date;
        }>(
          "SELECT r.id,r.booking_id,r.rating,r.body,r.created_at,b.service_name,b.professional_name FROM beauty.reviews r JOIN beauty.bookings b ON b.id=r.booking_id WHERE b.customer_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 100",
          [account.id],
        )
      ).rows,
  );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link className="back-link" href="/account">
          ← Your account
        </Link>
        <p className="eyebrow">YOUR VERIFIED VISITS</p>
        <h1>My reviews</h1>
        <div className="customer-review-list">
          {reviews.map((review) => (
            <article key={review.id}>
              <span
                className="review-stars"
                aria-label={`${review.rating} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    size={17}
                    fill={i < review.rating ? "currentColor" : "none"}
                    aria-hidden
                  />
                ))}
              </span>
              <h2>{review.service_name}</h2>
              <p>{review.professional_name}</p>
              <blockquote>{review.body}</blockquote>
              <Link
                className="text-link"
                href={`/account/bookings/${review.booking_id}`}
              >
                View appointment →
              </Link>
            </article>
          ))}
        </div>
        {!reviews.length && (
          <section className="catalog-empty">
            <Star size={30} aria-hidden />
            <h2>Your experience matters.</h2>
            <p>
              After a completed appointment, open the booking to leave a
              verified review.
            </p>
            <Link className="button" href="/account/bookings?view=history">
              View past appointments
            </Link>
          </section>
        )}
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
