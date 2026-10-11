import type {
  OwnerBackendHealth,
  PaymentLaunchReadiness,
} from "@/modules/admin/repository";

function dateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London" })
    : "No run recorded yet";
}

export function OwnerBackendHealthPanel({
  health,
  payment,
}: {
  health: OwnerBackendHealth;
  payment: PaymentLaunchReadiness | null;
}) {
  const requiredPaymentBlocked =
    payment?.checks.filter((check) => check.required && !check.ready) ?? [];
  const exhausted =
    health.queues.bookingEmailExhausted +
    health.queues.productEmailExhausted +
    health.queues.marketingExhausted;
  const integrityIssues =
    health.integrity.unbalancedLedgerTransactions +
    health.integrity.negativeProfessionalAvailableBalances +
    health.integrity.bookingsMissingQuote +
    health.integrity.paidOrdersMissingPaymentLedger +
    health.integrity.bookingRefundAmountMismatches +
    health.integrity.bookingTransfersMissingProviderId +
    health.integrity.productTransfersMissingProviderId +
    health.integrity.payoutAmountMismatches +
    health.integrity.openDisputeReserveMismatches;

  return (
    <div className="owner-backend-health">
      <div className="analytics-grid">
        <article>
          <strong>{health.jobs.maintenance.failures24h}</strong>
          <span>Maintenance failures · 24h</span>
        </article>
        <article>
          <strong>{health.jobs.notifications.failures24h}</strong>
          <span>Automated email failures · 24h</span>
        </article>
        <article>
          <strong>{exhausted}</strong>
          <span>Emails that used all retry attempts</span>
        </article>
        <article>
          <strong>{payment ? requiredPaymentBlocked.length : "—"}</strong>
          <span>Payment setup checks needing attention</span>
        </article>
        <article>
          <strong>{integrityIssues}</strong>
          <span>Payment record issues</span>
        </article>
      </div>

      <div className="service-edit-list">
        <article className="service-edit-row">
          <div>
            <h3>Scheduled maintenance</h3>
            <p>Last success: {dateTime(health.jobs.maintenance.lastSuccessAt)}</p>
            <small>
              Last failure: {dateTime(health.jobs.maintenance.lastFailureAt)}
            </small>
          </div>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Automated notifications and emails</h3>
            <p>Last success: {dateTime(health.jobs.notifications.lastSuccessAt)}</p>
            <small>
              Last failure: {dateTime(health.jobs.notifications.lastFailureAt)}
            </small>
          </div>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Emails waiting to send</h3>
            <p>
              Booking {health.queues.bookingEmailPending} pending · Shop{" "}
              {health.queues.productEmailPending} pending · Marketing{" "}
              {health.queues.marketingPending} pending
            </p>
            <small>
              All retry attempts used: booking {health.queues.bookingEmailExhausted}, Shop{" "}
              {health.queues.productEmailExhausted}, marketing{" "}
              {health.queues.marketingExhausted}
            </small>
          </div>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Payment record checks</h3>
            <p>
              Unbalanced payment records {health.integrity.unbalancedLedgerTransactions} ·
              negative balances {health.integrity.negativeProfessionalAvailableBalances}
            </p>
            <small>
              Missing booking price records {health.integrity.bookingsMissingQuote} ·
              paid Shop orders missing payment records {health.integrity.paidOrdersMissingPaymentLedger}
            </small>
            <small>
              Refund mismatches {health.integrity.bookingRefundAmountMismatches} ·
              missing transfer references {health.integrity.bookingTransfersMissingProviderId + health.integrity.productTransfersMissingProviderId} ·
              payout mismatches {health.integrity.payoutAmountMismatches} ·
              dispute reserve mismatches {health.integrity.openDisputeReserveMismatches}
            </small>
          </div>
          <span className={`admin-status ${integrityIssues ? "admin-status-suspended" : "admin-status-active"}`}>
            {integrityIssues ? "ATTENTION" : "HEALTHY"}
          </span>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Payment setup</h3>
            <p>
              {!payment
                ? "Payment setup status could not be loaded. Open Payment setup and retry loading the page."
                : requiredPaymentBlocked.length
                  ? "Required payment setup is incomplete. Review the checks before accepting real customer payments."
                  : "All required payment setup checks are passing."}
            </p>
            {requiredPaymentBlocked.length > 0 && (
              <small>
                Blocked: {requiredPaymentBlocked.map((check) => check.label).join(", ")}
              </small>
            )}
            <a href="#payment-readiness">View payment setup checks →</a>
          </div>
          <span
            className={`admin-status ${
              !payment || requiredPaymentBlocked.length
                ? "admin-status-suspended"
                : "admin-status-active"
            }`}
          >
            {!payment ? "UNAVAILABLE" : requiredPaymentBlocked.length ? "ATTENTION" : "HEALTHY"}
          </span>
        </article>
      </div>
    </div>
  );
}
