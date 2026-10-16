import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import type { NotificationPreference } from "./preferences";
export type PushDevice = {
  id: string;
  label: string;
  created_at: string;
  last_success_at: string | null;
  disabled_at: string | null;
};
export async function professionalNotificationSettings(db: SqlClient) {
  return (
    await db.query<{
      data: { preferences: NotificationPreference[]; devices: PushDevice[] };
    }>("SELECT beauty.my_notification_settings() AS data")
  ).rows[0].data;
}
export async function saveNotificationPreference(
  db: SqlClient,
  preference: NotificationPreference,
) {
  await db.query("SELECT beauty.set_notification_preference($1,$2,$3)", [
    preference.category,
    preference.email,
    preference.push,
  ]);
}
