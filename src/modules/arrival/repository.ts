import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type { ArrivalAction, ArrivalState } from "./domain";

export async function arrivalState(db: SqlClient, id: string) {
  return (
    await db.query<{ data: ArrivalState }>(
      "SELECT beauty.appointment_arrival($1) AS data",
      [id],
    )
  ).rows[0].data;
}
export async function arrivalAction(
  db: SqlClient,
  id: string,
  action: ArrivalAction,
) {
  return (
    await db.query<{ data: ArrivalState }>(
      "SELECT beauty.appointment_arrival_action($1,$2::jsonb) AS data",
      [id, JSON.stringify(action)],
    )
  ).rows[0].data;
}
