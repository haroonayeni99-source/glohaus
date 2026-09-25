import { CircleHelp } from "lucide-react";
import { money } from "@/modules/professionals/domain";

/**
 * Renders the amounts already authorised by the booking flow. A platform fee
 * is intentionally left as pending until a server-side quote exists; the UI
 * never invents a customer charge.
 */
export function PaymentSummary({
  servicePricePence,
  depositPence,
  bookingFeePence = null,
}: {
  servicePricePence: number;
  depositPence: number;
  bookingFeePence?: number | null;
}) {
  const hasFee = bookingFeePence !== null;
  return (
    <section className="payment-summary" aria-label="Payment summary">
      <p className="eyebrow">PAYMENT SUMMARY</p>
      <div>
        <span>Service price</span>
        <strong>{money(servicePricePence)}</strong>
      </div>
      <div>
        <span>Deposit due now</span>
        <strong>{money(depositPence)}</strong>
      </div>
      {hasFee && (
        <div>
          <span className="payment-fee-label">
            GLOHAUS booking fee <CircleHelp size={14} aria-hidden />
          </span>
          <strong>{money(bookingFeePence)}</strong>
        </div>
      )}
      <div className="payment-summary-total">
        <span>Total payable now</span>
        <strong>
          {money(depositPence + (bookingFeePence ?? 0))}
        </strong>
      </div>
      <div className="payment-summary-balance">
        <span>Remaining service balance</span>
        <strong>{money(servicePricePence - depositPence)}</strong>
      </div>
      {!hasFee && (
        <p className="payment-summary-note">
          No additional GLOHAUS customer booking fee is included in this
          summary. The professional-required deposit remains capped at 40% of
          the service price.
        </p>
      )}
    </section>
  );
}
