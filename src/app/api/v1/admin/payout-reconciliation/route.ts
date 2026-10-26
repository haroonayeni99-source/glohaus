import { apiError, json } from "@/lib/http";
import { adminFinanceOverview } from "@/modules/admin/repository";
import { withPaymentWorker } from "@/modules/payments/worker";
import {
  auditPayout,
  type PayoutAuditRecord,
} from "@/modules/payments/payout-audit";

export const maxDuration = 60;
export async function GET() {
  try {
    // Reuse the existing Admin/MFA financial reporting boundary before any
    // provider reads. No role or bank data is accepted from the caller.
    const overview = await adminFinanceOverview();
    const names = new Map(
      overview.recentPayouts.map((p) => [p.id, p.business_name]),
    );
    const rows = await withPaymentWorker(
      async (db) =>
        (
          await db.query<PayoutAuditRecord>(
            `SELECT p.id,p.kind,p.requested_pence,p.bank_amount_pence,p.status,p.created_at,p.expected_arrival_at,
       p.provider_payout_id,p.provider_transfer_id,coalesce(r.stripe_account_id,a.stripe_account_id) AS stripe_account_id,r.issue_code
       FROM beauty.financial_payouts p LEFT JOIN beauty.financial_payout_requests r ON r.payout_id=p.id
       LEFT JOIN beauty.professional_payment_accounts a ON a.professional_id=p.professional_id
       WHERE p.id=ANY($1::uuid[]) ORDER BY p.created_at DESC LIMIT 10`,
            [overview.recentPayouts.map((p) => p.id)],
          )
        ).rows,
    );
    const checks = [];
    for (let i = 0; i < rows.length; i += 3)
      checks.push(
        ...(await Promise.all(
          rows
            .slice(i, i + 3)
            .map(async (row) => ({
              ...(await auditPayout(row)),
              professional: names.get(row.id) || "Professional",
            })),
        )),
      );
    return json({
      checkedAt: new Date().toISOString(),
      readOnly: true,
      limit: 10,
      checks,
    });
  } catch (error) {
    return apiError(error);
  }
}
