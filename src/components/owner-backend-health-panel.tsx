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
    health.integrity.paidOrdersMissingPaymentLedger;

  return (
    <div className="owner-backend-health">
      <div className="analytics-grid">
        <article>
          <strong>{health.jobs.maintenance.failures24h}</strong>
          <span>Maintenance failures · 24h</span>
        </article>
        <article>
          <strong>{health.jobs.notifications.failures24h}</strong>
          <span>Email worker failures · 24h</span>
        </article>
        <article>
          <strong>{exhausted}</strong>
          <span>Exhausted email jobs</span>
        </article>
        <article>
          <strong>{requiredPaymentBlocked.length}</strong>
          <span>Required payment checks blocked</span>
        </article>
        <article>
          <strong>{integrityIssues}</strong>
          <span>Financial integrity issues</span>
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
            <h3>Notification & email worker</h3>
            <p>Last success: {dateTime(health.jobs.notifications.lastSuccessAt)}</p>
            <small>
              Last failure: {dateTime(health.jobs.notifications.lastFailureAt)}
            </small>
          </div>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Email queues</h3>
            <p>
              Booking {health.queues.bookingEmailPending} pending · Shop{" "}
              {health.queues.productEmailPending} pending · Marketing{" "}
              {health.queues.marketingPending} pending
            </p>
            <small>
              Exhausted: booking {health.queues.bookingEmailExhausted}, Shop{" "}
              {health.queues.productEmailExhausted}, marketing{" "}
              {health.queues.marketingExhausted}
            </small>
          </div>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Financial integrity</h3>
            <p>
              Ledger {health.integrity.unbalancedLedgerTransactions} unbalanced ·
              negative balances {health.integrity.negativeProfessionalAvailableBalances}
            </p>
            <small>
              Missing booking quotes {health.integrity.bookingsMissingQuote} ·
              paid Shop orders missing ledger {health.integrity.paidOrdersMissingPaymentLedger}
            </small>
          </div>
          <span className={`admin-status ${integrityIssues ? "admin-status-suspended" : "admin-status-active"}`}>
            {integrityIssues ? "ATTENTION" : "HEALTHY"}
          </span>
        </article>

        <article className="service-edit-row">
          <div>
            <h3>Payment runtime</h3>
            <p>
              {requiredPaymentBlocked.length
                ? "Real-money flows are not launch-ready."
                : "All required payment readiness checks are passing."}
            </p>
            {requiredPaymentBlocked.length > 0 && (
              <small>
                Blocked: {requiredPaymentBlocked.map((check) => check.label).join(", ")}
              </small>
            )}
          </div>
          <span
            className={`admin-status ${
              requiredPaymentBlocked.length
                ? "admin-status-suspended"
                : "admin-status-active"
            }`}
          >
            {requiredPaymentBlocked.length ? "ATTENTION" : "HEALTHY"}
          </span>
        </article>
      </div>
    </div>
  );
}
