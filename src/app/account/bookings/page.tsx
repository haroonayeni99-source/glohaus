import { WorkspaceIntro } from "@/components/workspace-intro";
export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { AccessMessage } from "@/components/access-message";
import { BottomNavigation } from "@/components/bottom-navigation";
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
      <PublicHeader signedIn />
      <main id="main" className="catalog-page">
        <WorkspaceIntro eyebrow="YOUR APPOINTMENTS" title={<>A little time <em>for you.</em></>}><p>Your upcoming appointments and past visits, together in one place.</p></WorkspaceIntro>
        <BookingNavigation
          view={options.view}
          base="/account/bookings"
          after={Boolean(options.after)}
          next={bookings.next}
        >
          <BookingList bookings={bookings.bookings} />
        </BookingNavigation>
      </main>
      <BottomNavigation active="bookings" signedIn />
    </>
  );
}
