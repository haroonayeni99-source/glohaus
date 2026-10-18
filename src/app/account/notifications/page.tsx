import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalNotificationSettings } from "@/components/professional-notification-settings";
import type { PushDevice } from "@/modules/notifications/professional-repository";
import type { NotificationPreference } from "@/modules/notifications/preferences";
export const dynamic = "force-dynamic";
export const metadata = { title: "Phone notification settings" };
export default async function CustomerNotificationSettingsPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <main id="main" className="standalone-message">
        <AccessMessage code={result.error} />
      </main>
    );
  let settings;
  try {
    settings = await withIdentity(
      result.account.authId,
      async (db) =>
        (
          await db.query<{
            data: {
              preferences: NotificationPreference[];
              devices: PushDevice[];
            };
          }>("SELECT beauty.customer_notification_settings() AS data")
        ).rows[0].data,
    );
  } catch {
    return (
      <>
        <PublicHeader signedIn />
        <main id="main" className="pwa-install-page">
          <h1>Phone notification settings</h1>
          <p>
            We couldn’t load your settings. Reconnect and try again shortly.
          </p>
          <Link href="/account">Back to your account</Link>
        </main>
      </>
    );
  }
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" className="pwa-install-page">
        <Link href="/account">← Your account</Link>
        <h1>Phone notification settings</h1>
        <ProfessionalNotificationSettings
          audience="customer"
          initial={settings}
          publicKey={process.env.VAPID_PUBLIC_KEY || null}
          pushConfigured={Boolean(
            process.env.VAPID_PUBLIC_KEY &&
            process.env.VAPID_PRIVATE_KEY &&
            process.env.VAPID_SUBJECT,
          )}
        />
      </main>
    </>
  );
}
