import { money } from "@/modules/professionals/domain";
import type { AdminFinanceOverview } from "@/modules/admin/repository";

function sourceLabel(source: string) {
  if (source === "booking") return "Bookings";
  if (source === "product_order") return "Shop orders";
  if (source === "payout") return "Withdrawals";
  if (source === "refund") return "Refunds";
  if (source === "admin") return "Admin adjustments";
  return source.replaceAll("_", " ");
}

export function AdminFinancePanel({
  data,
}: {
  data: AdminFinanceOverview | null;
}) {
  if (!data)
    return (
      <section id="payments" className="admin-workspace-section">
        <p className="eyebrow">PAYMENTS & ANALYTICS</p>
        <h2>Financial reporting unavailable</h2>
        <p className="lead">
          The finance reporting migration has not been applied to this environment.
        </p>
      </section>
    );

  const m = data.metrics;
  return (
    <>
      <section id="payments" className="admin-workspace-section">
        <p className="eyebrow">PLATFORM PAYMENTS</p>
        <h2>Money moving through GLOHAUS</h2>
        <p className="lead">
          Read-only operational totals from the protected ledger, booking payments,
          professional subscriptions and payout records.
        </p>

        <div className="analytics-grid">
          <article>
            <strong>{money(m.bookingCapturedPence)}</strong>
            <span>Booking payments captured</span>
          </article>
          <article>
            <strong>{money(m.bookingRefundedPence)}</strong>
            <span>Booking refunds sent</span>
          </article>
          <article>
            <strong>{money(m.payoutPaidPence)}</strong>
            <span>Paid out to professionals</span>
          </article>
          <article>
            <strong>{money(m.professionalOutstandingPence)}</strong>
            <span>Professional outstanding obligations</span>
          </article>
        </div>

        <div className="analytics-grid">
          <article>
            <strong>{data.payoutCounts.requested}</strong>
            <span>Payouts requested</span>
          </article>
          <article>
            <strong>{data.payoutCounts.processing}</strong>
            <span>Payouts processing</span>
          </article>
          <article>
            <strong>{data.payoutCounts.paid}</strong>
            <span>Payouts paid</span>
          </article>
          <article>
            <strong>{data.payoutCounts.failed + data.payoutCounts.cancelled}</strong>
            <span>Payouts failed / cancelled</span>
          </article>
        </div>

        <h3>Recent professional payouts</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Professional</th>
                <th>Type</th>
                <th>Requested</th>
                <th>GLOHAUS fee</th>
                <th>Bank amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{payout.business_name || "Professional"}</td>
                  <td>{payout.kind}</td>
                  <td>{money(payout.requested_pence)}</td>
                  <td>{money(payout.withdrawal_fee_pence)}</td>
                  <td>{money(payout.bank_amount_pence)}</td>
                  <td>{payout.status}</td>
                </tr>
              ))}
              {!data.recentPayouts.length && (
                <tr><td colSpan={6}>No payout requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="analytics" className="admin-workspace-section">
        <p className="eyebrow">BUSINESS ANALYTICS</p>
        <h2>Revenue and platform obligations</h2>
        <p className="lead">
          Ledger revenue is net of any ledger reversals. Subscription MRR is the
          current monthly list value of active Pro/Premium subscriptions, not a
          promise that every invoice has been collected.
        </p>

        <div className="analytics-grid">
          <article>
            <strong>{money(m.platformRevenuePence)}</strong>
            <span>Ledger platform revenue · lifetime</span>
          </article>
          <article>
            <strong>{money(m.platformRevenue30dPence)}</strong>
            <span>Ledger platform revenue · 30 days</span>
          </article>
          <article>
            <strong>{money(m.activeSubscriptionMrrPence)}</strong>
            <span>Active paid-plan MRR</span>
          </article>
          <article>
            <strong>{m.activePaidSubscriptions}</strong>
            <span>Active Pro/Premium subscriptions</span>
          </article>
          <article>
            <strong>{money(m.professionalPendingPence)}</strong>
            <span>Professional earnings pending</span>
          </article>
          <article>
            <strong>{money(m.professionalAvailablePence)}</strong>
            <span>Professional earnings available</span>
          </article>
          <article>
            <strong>{money(m.instantWithdrawalFeesPence)}</strong>
            <span>Instant-withdrawal fees recorded</span>
          </article>
          <article>
            <strong>{money(m.payoutRequestedPence)}</strong>
            <span>Total professional payout requests</span>
          </article>
        </div>

        <h3>30-day platform revenue by source</h3>
        <div className="service-edit-list">
          {data.revenueBySource30d.map((row) => (
            <article className="service-edit-row" key={row.source}>
              <div>
                <h3>{sourceLabel(row.source)}</h3>
                <p>Ledger-recognised platform fees during the last 30 days.</p>
              </div>
              <strong>{money(row.revenuePence)}</strong>
            </article>
          ))}
          {!data.revenueBySource30d.length && (
            <p className="lead">No platform-fee ledger revenue has been posted in the last 30 days.</p>
          )}
        </div>
      </section>
    </>
  );
}
