import type { SqlClient } from "@/modules/accounts/repository";

export type WalletOverview = {
  pendingPence: number;
  availablePence: number;
  reservedPence: number;
  processingPence: number;
  disputedPence: number;
  taxPotPence: number;
  outstandingObligationPence: number;
  withdrawalsBlocked: boolean;
  instantPayoutBlocked: boolean;
};

export async function professionalWallet(
  db: SqlClient,
): Promise<WalletOverview> {
  const result = await db.query<{ data: WalletOverview }>(
    "SELECT beauty.my_wallet_overview() AS data",
  );
  return result.rows[0]?.data;
}


export type CustomerPaymentRecord = {
  booking_id: string;
  service_name: string;
  professional_name: string;
  starts_at: Date;
  booking_status: string;
  price_pence: number;
  deposit_pence: number;
  captured_pence: number;
  refunded_pence: number;
  payment_status: string;
  payment_updated_at: Date;
  refund_status: string | null;
  refund_amount_pence: number | null;
};

export type CustomerPaymentOverview = {
  capturedPence: number;
  refundedPence: number;
  refundPendingPence: number;
  records: CustomerPaymentRecord[];
};

export async function customerPaymentOverview(
  db: SqlClient,
  customerId: string,
): Promise<CustomerPaymentOverview> {
  const records = (
    await db.query<CustomerPaymentRecord>(
      `SELECT
        b.id AS booking_id,
        b.service_name,
        b.professional_name,
        b.starts_at,
        b.status AS booking_status,
        b.price_pence,
        b.deposit_pence,
        p.captured_pence,
        p.refunded_pence,
        p.status AS payment_status,
        p.updated_at AS payment_updated_at,
        r.status AS refund_status,
        r.amount_pence AS refund_amount_pence
       FROM beauty.bookings b
       JOIN beauty.payments p ON p.booking_id=b.id
       LEFT JOIN beauty.refund_decisions r ON r.booking_id=b.id
       WHERE b.customer_id=$1
       ORDER BY p.updated_at DESC,b.created_at DESC
       LIMIT 100`,
      [customerId],
    )
  ).rows;

  return {
    capturedPence: records.reduce(
      (total, row) => total + row.captured_pence,
      0,
    ),
    refundedPence: records.reduce(
      (total, row) => total + row.refunded_pence,
      0,
    ),
    refundPendingPence: records.reduce(
      (total, row) =>
        total +
        (row.refund_status &&
        ["queued", "pending"].includes(row.refund_status)
          ? row.refund_amount_pence ?? 0
          : 0),
      0,
    ),
    records,
  };
}
