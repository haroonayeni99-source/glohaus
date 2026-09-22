export const dynamic = "force-dynamic";

import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { NotificationInbox } from "@/components/notification-inbox";
import { inAppNotifications, type InAppNotification } from "@/modules/notifications/repository";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const result = await pageAccount();
  if (!result.account)
    return (
      <div className="standalone-message"><AccessMessage code={result.error} /></div>
    );
  const professional = result.account.roles.includes("professional");
  let notifications: InAppNotification[] | null = null;
  try {
    notifications = await withIdentity(result.account.authId, inAppNotifications);
  } catch {
    // A deployment can arrive before its database migration. Do not substitute
    // fake events; show an explicit, recoverable state instead.
  }
  const content = notifications === null ? (
    <section className={professional ? "pro-empty-state pro-large-empty" : "catalog-empty"}>
      <h2>Notifications are being prepared.</h2>
      <p>Your private activity feed will appear here once its secure data update is available.</p>
      <Link href={professional ? "/professional" : "/"}>Go back</Link>
    </section>
  ) : (
    <NotificationInbox initialNotifications={notifications} professional={professional} />
  );
  if (professional)
    return (
      <div className="pro-app">
        <ProfessionalNavigation active="more" displayName={result.account.displayName} />
        <main id="main" className="pro-main pro-list-page">
          <p className="pro-kicker">ACTIVITY</p>
          <h1>Your notifications.</h1>
          <p className="pro-page-lead">Booking activity appears here as it is recorded for your account.</p>
          {content}
        </main>
      </div>
    );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page notification-page">
        <p className="eyebrow">ACTIVITY</p>
        <h1>Your notifications.</h1>
        <p className="lead">Booking activity appears here as it is recorded for your account.</p>
        {content}
      </main>
    </>
  );
}
