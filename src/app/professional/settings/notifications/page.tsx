import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalNotificationSettings } from "@/components/professional-notification-settings";
import { professionalNotificationSettings } from "@/modules/notifications/professional-repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Notification settings · GLOHAUS PRO" };
export default async function NotificationSettingsPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const settings = await withIdentity(
    account.authId,
    professionalNotificationSettings,
  );
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link className="pro-back-link" href="/professional/tools">
          ← Settings and business tools
        </Link>
        <p className="pro-kicker">SETTINGS</p>
        <h1>Notifications</h1>
        <p className="pro-page-lead">
          Choose your email and push alerts, and manage the devices that receive
          them.
        </p>
        <ProfessionalNotificationSettings
          initial={settings}
          publicKey={process.env.VAPID_PUBLIC_KEY || null}
          pushConfigured={Boolean(
            process.env.VAPID_PUBLIC_KEY &&
            process.env.VAPID_PRIVATE_KEY &&
            process.env.VAPID_SUBJECT,
          )}
        />
      </main>
    </div>
  );
}
