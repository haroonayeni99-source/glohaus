import "server-only";

import type { SqlClient } from "@/modules/accounts/repository";
import { bookingPage } from "@/modules/bookings/repository";
import { customerPaymentOverview } from "@/modules/finance/repository";
import { conversationInbox } from "@/modules/messages/repository";

export type CustomerHomeSummary = {
  nextBooking: {
    id: string;
    serviceName: string;
    professionalName: string;
    startsAt: Date | string;
    status: string;
  } | null;
  messages: {
    conversationCount: number;
    unreadCount: number;
    latestProfessionalName: string | null;
    latestMessageBody: string | null;
  };
  payments: {
    capturedPence: number;
    refundedPence: number;
    pendingRefundPence: number;
  };
};

export async function customerHomeSummary(
  db: SqlClient,
  customerId: string,
): Promise<CustomerHomeSummary> {
  const [upcoming, conversations, payments] = await Promise.all([
    bookingPage(
      db,
      { role: "customer", id: customerId },
      { view: "upcoming" },
    ),
    conversationInbox(db, customerId, null),
    customerPaymentOverview(db, customerId),
  ]);

  const next = upcoming.bookings[0] ?? null;
  const latest = conversations[0] ?? null;

  return {
    nextBooking: next
      ? {
          id: next.id,
          serviceName: next.service_name,
          professionalName: next.professional_name,
          startsAt: next.starts_at,
          status: next.status,
        }
      : null,
    messages: {
      conversationCount: conversations.length,
      unreadCount: conversations.reduce(
        (total, conversation) => total + conversation.unread_count,
        0,
      ),
      latestProfessionalName: latest?.professional_name ?? null,
      latestMessageBody: latest?.last_message_body ?? null,
    },
    payments: {
      capturedPence: payments.capturedPence,
      refundedPence: payments.refundedPence,
      pendingRefundPence: payments.pendingRefundPence,
    },
  };
}
