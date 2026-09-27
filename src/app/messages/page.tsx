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
    view?: string;
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
  const professionalMode =
    query.view === "professional" && account.roles.includes("professional");
  const customerScopeId = professionalMode
    ? "00000000-0000-0000-0000-000000000000"
    : account.id;
  const requestedThread = uuid(query.thread);
  const requestedBooking = requestedThread ? null : uuid(query.booking);
  const requestedProfessional = requestedThread
    ? null
    : uuid(query.professional);

  const data = await withIdentity(account.authId, async (db) => {
    const inbox = await conversationInbox(
      db,
      customerScopeId,
      professionalMode ? account.professionalId : null,
    );

    const activeConversation = requestedThread
      ? await conversationDetails(
          db,
          requestedThread,
          customerScopeId,
          professionalMode ? account.professionalId : null,
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
          professionalMode
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
      view={professionalMode ? "professional" : "customer"}
      activeConversation={data.activeConversation}
      initialMessages={data.page.messages}
      initialCursor={data.page.next}
      bookingId={data.bookingId}
      professionalId={data.professionalId}
      draftRecipientName={data.draftRecipientName}
      professionalMessaging={professionalMode}
    />
  );

  if (professionalMode)
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
      <PublicHeader signedIn />
      <main id="main" className="messages-page">
        {centre}
      </main>
      <BottomNavigation active="messages" signedIn />
    </>
  );
}
