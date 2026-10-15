import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type {
  BookingPolicy,
  PolicyAdminOverview,
  PolicyPreview,
  PolicyWorkspace,
} from "./domain";
async function data<T>(db: SqlClient, sql: string, args: unknown[] = []) {
  return (await db.query<{ data: T }>(sql, args)).rows[0].data;
}
export const policyWorkspace = (db: SqlClient) =>
  data<PolicyWorkspace>(db, "SELECT beauty.my_policy_workspace() AS data");
export const servicePolicy = (db: SqlClient, id: string,options?:{variationId?:string|null;extraIds?:string[]}) =>
  options?data<PolicyPreview>(db,"SELECT beauty.public_service_policy($1,$2,$3) AS data",[id,options.variationId??null,options.extraIds??[]]):data<PolicyPreview>(db,"SELECT beauty.public_service_policy($1) AS data",[id]);
export const bookingPolicy = (db: SqlClient, id: string) =>
  data<BookingPolicy>(db, "SELECT beauty.booking_policy_overview($1) AS data", [
    id,
  ]);
export const adminPolicies = (
  db: SqlClient,
  query = "",
  bookingId: string | null = null,
) =>
  data<PolicyAdminOverview>(
    db,
    "SELECT beauty.admin_policy_overview($1,$2) AS data",
    [query, bookingId],
  );
