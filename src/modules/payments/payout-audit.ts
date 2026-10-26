import "server-only";
import { stripe } from "./stripe";

export type PayoutAuditRecord = {
  id: string;
  kind: "standard" | "instant";
  requested_pence: number;
  bank_amount_pence: number;
  status: string;
  created_at: string | Date;
  expected_arrival_at: string | Date | null;
  provider_payout_id: string | null;
  provider_transfer_id: string | null;
  stripe_account_id: string | null;
  issue_code: string | null;
};

// Read-only comparison. This function cannot create/reverse transfers, create
// payouts, update ledger entries or reveal an external bank account.
export async function auditPayout(row: PayoutAuditRecord) {
  const issues: string[] = [];
  let stripeStatus: string | null = null;
  if (!row.stripe_account_id)
    return {
      id: row.id,
      platformStatus: row.status,
      stripeStatus,
      issues: [
        "Connected account is missing. Review the professional's Stripe setup.",
      ],
    };
  try {
    const transfer = row.provider_transfer_id
      ? await stripe().transfers.retrieve(row.provider_transfer_id)
      : (
          await stripe().transfers.list({
            transfer_group: `withdrawal_${row.id}`,
            limit: 2,
          })
        ).data[0];
    if (transfer) {
      const destination =
        typeof transfer.destination === "string"
          ? transfer.destination
          : transfer.destination?.id;
      if (
        destination !== row.stripe_account_id ||
        transfer.amount !== row.requested_pence ||
        transfer.currency !== "gbp" ||
        transfer.metadata?.glohaus_payout_id !== row.id
      )
        issues.push(
          "Transfer details do not match this withdrawal. Keep funds reserved for review.",
        );
      if (
        ["failed", "cancelled"].includes(row.status) &&
        transfer.amount_reversed !== transfer.amount
      )
        issues.push(
          "Transfer recovery is not confirmed. Do not restore or send the funds again.",
        );
    } else if (!["failed", "cancelled"].includes(row.status))
      issues.push("Stripe transfer is not confirmed.");
    const payout = row.provider_payout_id
      ? await stripe().payouts.retrieve(
          row.provider_payout_id,
          {},
          { stripeAccount: row.stripe_account_id },
        )
      : (
          await stripe().payouts.list(
            {
              limit: 100,
              created: {
                gte: Math.floor(new Date(row.created_at).getTime() / 1000) - 60,
              },
            },
            { stripeAccount: row.stripe_account_id },
          )
        ).data.find((p) => p.metadata?.glohaus_payout_id === row.id);
    if (payout) {
      stripeStatus = payout.status;
      if (
        payout.amount !== row.bank_amount_pence ||
        payout.currency !== "gbp" ||
        payout.method !== row.kind ||
        payout.metadata?.glohaus_payout_id !== row.id ||
        !transfer ||
        payout.metadata?.glohaus_transfer_id !== transfer.id
      )
        issues.push(
          "Bank payout details do not match this withdrawal. Review in Stripe before taking action.",
        );
      const mapped =
        payout.status === "canceled"
          ? "cancelled"
          : ["pending", "in_transit"].includes(payout.status)
            ? "processing"
            : payout.status;
      if (mapped !== row.status)
        issues.push(
          "Stripe and GLOHAUS statuses differ. Check signed webhook delivery before changing any records.",
        );
    } else if (!["failed", "cancelled"].includes(row.status))
      issues.push(
        "Bank payout is not confirmed. Do not send a replacement until Stripe establishes the outcome.",
      );
    if (row.issue_code)
      issues.push(
        "This withdrawal has a recorded processing issue. Keep it under review until Stripe and the wallet agree.",
      );
    if (
      row.status === "processing" &&
      row.expected_arrival_at &&
      new Date(row.expected_arrival_at).getTime() < Date.now()
    )
      issues.push("The estimated bank arrival date has passed.");
    return { id: row.id, platformStatus: row.status, stripeStatus, issues };
  } catch {
    return {
      id: row.id,
      platformStatus: row.status,
      stripeStatus,
      issues: [
        "Stripe could not be checked. No money or wallet records were changed.",
      ],
    };
  }
}
