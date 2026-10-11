import Link from "next/link";
export function HomeMarketplaceGuide() {
  return (
    <section
      className="home-marketplace-guide"
      aria-label="How to book with GLOHAUS"
    >
      <p className="eyebrow">YOUR NEXT BEAUTY APPOINTMENT</p>
      <h2>Independent beauty, easier to book.</h2>
      <p>
        GLOHAUS connects you with beauty professionals and their work. Browse
        freely, compare your options and choose the right appointment for you.
      </p>
      <ol>
        <li>
          <strong>Find your service</strong>
          <span>Search hair, nails, brows, makeup and more in your area.</span>
        </li>
        <li>
          <strong>Know who you’re booking</strong>
          <span>
            Check portfolios, verification badges and reviews from completed
            bookings.
          </span>
        </li>
        <li>
          <strong>Book with clear details</strong>
          <span>
            See the service price, amount due now and cancellation policy before
            checkout.
          </span>
        </li>
      </ol>
      <Link href="/how-it-works">See how GLOHAUS works →</Link>
    </section>
  );
}
