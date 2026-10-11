import "server-only";
import type { SqlClient } from "./repository";
import { z } from "zod";
import { customerNameSchema } from "./customer-profile-domain";
export type CustomerProfile = {
  first_name: string;
  last_name: string;
  has_photo: boolean;
};
export async function customerProfile(db: SqlClient, userId: string) {
  return (
    await db.query<CustomerProfile>(
      `SELECT first_name,last_name,(photo IS NOT NULL) AS has_photo FROM beauty.customer_profiles WHERE user_id=$1`,
      [userId],
    )
  ).rows[0];
}
export async function saveCustomerName(
  db: SqlClient,
  userId: string,
  value: z.infer<typeof customerNameSchema>,
) {
  await db.query(
    `UPDATE beauty.customer_profiles SET first_name=$2,last_name=$3 WHERE user_id=$1`,
    [userId, value.firstName, value.lastName],
  );
  await db.query(`UPDATE beauty.users SET display_name=$2 WHERE id=$1`, [
    userId,
    [value.firstName, value.lastName].filter(Boolean).join(" "),
  ]);
}
export async function initialiseCustomerName(
  db: SqlClient,
  userId: string,
  name?: z.infer<typeof customerNameSchema>,
) {
  if (!name) return;
  const updated = await db.query(
    `UPDATE beauty.customer_profiles SET first_name=$2,last_name=$3 WHERE user_id=$1 AND first_name='' RETURNING user_id`,
    [userId, name.firstName, name.lastName],
  );
  if (updated.rows.length)
    await db.query(`UPDATE beauty.users SET display_name=$2 WHERE id=$1`, [
      userId,
      [name.firstName, name.lastName].filter(Boolean).join(" "),
    ]);
}
