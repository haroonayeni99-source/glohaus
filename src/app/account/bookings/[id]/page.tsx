export const dynamic = "force-dynamic";

import { RefundForm } from "@/components/refund-form";
import { RefundAppealForm } from "@/components/refund-appeal-form";
import { ReviewForm } from "@/components/review-form";
import { notFound } from "next/navigation";
import { z } from "zod";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { AccessMessage } from "@/components/access-message";
import { BookingActions } from "@/components/booking-actions";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { bookingById } from "@/modules/bookings/repository";
import { money } from "@/modules/professionals/domain";
export default async function Booking({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await pageAccount();
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const data = await withIdentity(account.authId, async (db) => ({
    booking: await bookingById(db, id),
    hasReview:
      (
        await db.query("SELECT id FROM beauty.reviews WHERE booking_id=$1", [
          id,
        ])
      ).rows.length > 0,
    professional:
      (
        await db.query(
          "SELECT id FROM beauty.bookings WHERE id=$1 AND professional_id=$2",
          [id, account.professionalId],
        )
      ).rows.length > 0,
    appeal:
      (
        await db.query<{ status: string }>(
          "SELECT a.status FROM beauty.refund_appeals a JOIN beauty.bookings b ON b.id=a.booking_id WHERE a.booking_id=$1 AND b.customer_id=(SELECT id FROM beauty.users WHERE auth_id=beauty.auth_id())",
          [id],
        )
      ).rows[0] ?? null,
    noRefundDecision:
      (
        await db.query<{ id: string }>(
          "SELECT r.id FROM beauty.refund_decisions r JOIN beauty.bookings b ON b.id=r.booking_id WHERE r.booking_id=$1 AND b.customer_id=(SELECT id FROM beauty.users WHERE auth_id=beauty.auth_id()) AND r.status='no_refund'",
          [id],
        )
      ).rows[0] ?? null,
  }));
  if (!data.booking) notFound();
  const b = data.booking;
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <p className="eyebrow">{b.status.replaceAll("_", " ")}</p>
        <h1>
          {b.status === "confirmed"
            ? "You’re booked in."
            : b.status === "payment_pending"
              ? "Awaiting your deposit."
              : "Your appointment."}
        </h1>
        <p className="lead">
          {b.service_name} with {b.professional_name}
        </p>
        {b.status === "confirmed" && !data.professional ? (
          <BookingConfirmation
            bookingId={b.id}
            serviceName={b.service_name}
            professionalName={b.professional_name}
            startsAt={new Date(b.starts_at).toISOString()}
            endsAt={new Date(b.ends_at).toISOString()}
            depositPence={b.captured_pence}
            remainingPence={b.price_pence - b.captured_pence + b.refunded_pence}
          />
        ) : (
        <section className="editor-form">
          <h2>
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/London",
            }).format(new Date(b.starts_at))}
          </h2>
          <p>Customer: {b.customer_name}</p>
          <div className="booking-price">
            <span>
              Service total<strong>{money(b.price_pence)}</strong>
            </span>
            <span>
              Deposit received<strong>{money(b.captured_pence)}</strong>
            </span>
            <span>
              Refunded<strong>{money(b.refunded_pence)}</strong>
            </span>
            {["confirmed", "completed"].includes(b.status) && (
              <span>
                Service balance
                <strong>
                  {money(b.price_pence - b.captured_pence + b.refunded_pence)}
                </strong>
              </span>
            )}
          </div>
          {b.status === "payment_pending" && (
            <p className="form-notice">
              This appointment is not confirmed yet. After payment, refresh this
              page to see the verified status.
            </p>
          )}
          {b.payment_status === "refund_required" && (
            <p className="form-notice">
              Your deposit is awaiting a refund decision or payment review. A
              cancellation does not itself mean a refund has been sent.
            </p>
          )}
        </section>
        )}
        {!data.professional &&
          b.status === "completed" &&
          !data.hasReview &&
          b.has_ended && <ReviewForm bookingId={id} />}
        {data.professional &&
          ["cancelled", "expired", "payment_pending"].includes(b.status) &&
          b.payment_status === "refund_required" && (
            <RefundForm bookingId={id} />
          )}
        {!data.professional &&
          data.noRefundDecision &&
          (data.appeal ? (
            <section className="editor-form">
              <h2>Appeal status</h2>
              <p className="lead">
                {data.appeal.status === "open"
                  ? "Your appeal is awaiting admin review."
                  : `Your appeal was ${data.appeal.status}.`}
              </p>
            </section>
          ) : (
            <RefundAppealForm bookingId={id} />
          ))}
        <BookingActions
          id={id}
          status={b.status}
          professional={data.professional}
          ended={b.has_ended}
        />
      </main>
    </>
  );
}
