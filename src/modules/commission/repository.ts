import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type {
  CommissionOverview,
  ProfessionalCommissionOverview,
} from "./domain";
export async function commissionOverview(db: SqlClient) {
  return (
    await db.query<{ data: CommissionOverview }>(
      "SELECT beauty.owner_commission_overview() AS data",
    )
  ).rows[0].data;
}
export async function myCommissionOverview(db: SqlClient) {
  return (
    await db.query<{ data: ProfessionalCommissionOverview }>(
      "SELECT beauty.my_commission_overview() AS data",
    )
  ).rows[0].data;
}
