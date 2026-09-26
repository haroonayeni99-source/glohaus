export const dynamic = "force-dynamic";

import { z } from "zod";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { MessageCentre } from "@/components/message-centre";
import {
  conversationDetails,
  conversationInbox,
  conversationMessagePage,
} from "@/modules/messages/repository";
import { bookingById } from "@/modules/bookings/repository";

export const metadata = { title: "Messages" };

function uuid(value?: string) {
  return value && z.uuid().safeParse(value).success ? value : null;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    thread?: string;
    booking?: string;
    professional?: string;
  }>;
}) {
  const result = await pageAccount();
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const account = result.account;
  const canMessage =
    account.roles.includes("customer") ||
    account.roles.includes("professional");
  if (!canMessage)
    return (
      <div className="standalone-message">
        <AccessMessage code="FORBIDDEN" />
      </div>
    );

  const query = await searchParams;
  const requestedThread = uuid(query.thread);
  const requestedBooking = requestedThread ? null : uuid(query.booking);
  const requestedProfessional = requestedThread
    ? null
    : uuid(query.professional);

  const data = await withIdentity(account.authId, async (db) => {
    const inbox = await conversationInbox(
      db,
      account.id,
      account.professionalId,
    );

    const activeConversation = requestedThread
      ? await conversationDetails(
          db,
          requestedThread,
          account.id,
          account.professionalId,
        )
      : null;

    const page = activeConversation
      ? await conversationMessagePage(db, activeConversation.id)
      : { messages: [], next: null, hasMore: false };

    let bookingId: string | null = null;
    let professionalId: string | null = null;
    let draftRecipientName: string | null = null;

    if (requestedBooking) {
      const booking = await bookingById(db, requestedBooking);
      if (booking) {
        bookingId = booking.id;
        draftRecipientName =
          account.professionalId &&
          account.roles.includes("professional")
            ? booking.customer_name
            : booking.professional_name;
      }
    } else if (
      requestedProfessional &&
      account.roles.includes("customer")
    ) {
      const professional = (
        await db.query<{ id: string; business_name: string }>(
          "SELECT id,business_name FROM beauty.public_professionals WHERE id=$1",
          [requestedProfessional],
        )
      ).rows[0];
      if (professional) {
        professionalId = professional.id;
        draftRecipientName = professional.business_name;
      }
    }

    return {
      inbox,
      activeConversation,
      page,
      bookingId,
      professionalId,
      draftRecipientName,
    };
  });

  const centre = (
    <MessageCentre
      initialConversations={data.inbox}
      activeConversation={data.activeConversation}
      initialMessages={data.page.messages}
      initialCursor={data.page.next}
      bookingId={data.bookingId}
      professionalId={data.professionalId}
      draftRecipientName={data.draftRecipientName}
      professionalMessaging={account.roles.includes("professional")}
    />
  );

  const professionalOnly =
    account.roles.includes("professional") &&
    !account.roles.includes("customer");

  if (professionalOnly)
    return (
      <div className="pro-app">
        <ProfessionalNavigation
          active="more"
          displayName={account.displayName}
        />
        <main id="main" className="pro-main pro-message-page">
          {centre}
        </main>
      </div>
    );

  return (
    <>
      <PublicHeader />
      <main id="main" className="messages-page">
        {centre}
      </main>
      <BottomNavigation active="messages" />
    </>
  );
}
