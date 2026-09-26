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
  bookingId: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  bookingStatus: string;
  servicePricePence: number;
  depositPence: number;
  capturedPence: number;
  refundedPence: number;
  paymentStatus: string;
  refundDecisionStatus: string | null;
  refundDecisionPence: number | null;
};

export type CustomerPaymentOverview = {
  capturedPence: number;
  refundedPence: number;
  pendingRefundPence: number;
  records: CustomerPaymentRecord[];
};

export async function customerPaymentOverview(
  db: SqlClient,
  customerId: string,
): Promise<CustomerPaymentOverview> {
  const records = (
    await db.query<{
      booking_id: string;
      service_name: string;
      professional_name: string;
      starts_at: Date;
      booking_status: string;
      service_price_pence: number;
      deposit_pence: number;
      captured_pence: number;
      refunded_pence: number;
      payment_status: string;
      refund_decision_status: string | null;
      refund_decision_pence: number | null;
    }>(
      `SELECT
        b.id AS booking_id,
        b.service_name,
        b.professional_name,
        b.starts_at,
        CASE
          WHEN b.status='payment_pending' AND b.hold_expires_at<=now()
            THEN 'expired'
          ELSE b.status
        END AS booking_status,
        b.price_pence AS service_price_pence,
        b.deposit_pence,
        p.captured_pence,
        p.refunded_pence,
        p.status AS payment_status,
        r.status AS refund_decision_status,
        r.amount_pence AS refund_decision_pence
       FROM beauty.bookings b
       JOIN beauty.payments p ON p.booking_id=b.id
       LEFT JOIN beauty.refund_decisions r ON r.booking_id=b.id
       WHERE b.customer_id=$1
       ORDER BY b.created_at DESC,b.id DESC
       LIMIT 100`,
      [customerId],
    )
  ).rows.map((row) => ({
    bookingId: row.booking_id,
    serviceName: row.service_name,
    professionalName: row.professional_name,
    startsAt: row.starts_at,
    bookingStatus: row.booking_status,
    servicePricePence: row.service_price_pence,
    depositPence: row.deposit_pence,
    capturedPence: row.captured_pence,
    refundedPence: row.refunded_pence,
    paymentStatus: row.payment_status,
    refundDecisionStatus: row.refund_decision_status,
    refundDecisionPence: row.refund_decision_pence,
  }));

  return {
    capturedPence: records.reduce(
      (total, record) => total + record.capturedPence,
      0,
    ),
    refundedPence: records.reduce(
      (total, record) => total + record.refundedPence,
      0,
    ),
    pendingRefundPence: records.reduce((total, record) => {
      if (
        record.refundDecisionPence &&
        ["queued", "pending"].includes(record.refundDecisionStatus || "")
      )
        return total + record.refundDecisionPence;
      return total;
    }, 0),
    records,
  };
}


export async function releaseMatureProductProceeds(db: SqlClient) {
  const result = await db.query<{ released: number }>(
    "SELECT beauty.release_my_mature_product_proceeds() AS released",
  );
  return result.rows[0]?.released ?? 0;
}
