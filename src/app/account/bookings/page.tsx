export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { AccessMessage } from "@/components/access-message";
import { BookingList } from "@/components/booking-list";
import { BookingNavigation } from "@/components/booking-navigation";
import { bookingListOptions } from "@/modules/bookings/listing";
import { bookingPage } from "@/modules/bookings/repository";
export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; after?: string }>;
}) {
  const options = bookingListOptions(await searchParams);
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const bookings = await withIdentity(account.authId, (db) =>
    bookingPage(db, { role: "customer", id: account.id }, options),
  );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <p className="eyebrow">YOUR APPOINTMENTS</p>
        <h1>
          A little time <em>for you.</em>
        </h1>
        <BookingNavigation
          view={options.view}
          base="/account/bookings"
          after={Boolean(options.after)}
          next={bookings.next}
        >
          <BookingList bookings={bookings.bookings} />
        </BookingNavigation>
      </main>
    </>
  );
}
