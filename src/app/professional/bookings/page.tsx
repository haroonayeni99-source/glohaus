export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { BookingList } from "@/components/booking-list";
import { BookingNavigation } from "@/components/booking-navigation";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { bookingListOptions } from "@/modules/bookings/listing";
import { bookingPage } from "@/modules/bookings/repository";
import { money } from "@/modules/professionals/domain";
export default async function Bookings({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; after?: string }>;
}) {
  const options = bookingListOptions(await searchParams);
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const data = await withIdentity(account.authId, async (db) => ({
    page: await bookingPage(
      db,
      { role: "professional", id: account.professionalId! },
      options,
    ),
    totals: (
      await db.query<{ captured: number; refunded: number }>(
        "SELECT coalesce(sum(p.captured_pence),0)::integer AS captured,coalesce(sum(p.refunded_pence),0)::integer AS refunded FROM beauty.payments p JOIN beauty.bookings b ON b.id=p.booking_id WHERE b.professional_id=$1",
        [account.professionalId],
      )
    ).rows[0],
  }));
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="bookings" displayName={account.displayName} />
      <main id="main" className="pro-main pro-list-page">
        <p className="pro-kicker">YOUR APPOINTMENTS</p>
        <h1>Keep your booking week in view.</h1>
        <p className="pro-page-lead">
          Each status comes from the protected appointment record. Deposits are
          shown here after payment verification.
        </p>
        <div className="pro-stat-grid pro-booking-summary">
          <article>
            <strong>{money(data.totals.captured)}</strong>
            <span>Deposits captured</span>
          </article>
          <article>
            <strong>{money(data.totals.refunded)}</strong>
            <span>Refunded</span>
          </article>
          <article>
            <strong>
              {money(data.totals.captured - data.totals.refunded)}
            </strong>
            <span>Net deposits before Stripe fees</span>
          </article>
        </div>
        <section className="pro-panel pro-bookings-list-panel">
          <BookingNavigation
            view={options.view}
            base="/professional/bookings"
            after={Boolean(options.after)}
            next={data.page.next}
          >
            <BookingList bookings={data.page.bookings} professional />
          </BookingNavigation>
        </section>
      </main>
    </div>
  );
}
