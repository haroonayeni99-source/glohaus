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
