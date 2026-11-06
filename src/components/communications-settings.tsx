import Link from "next/link";
import { withIdentity } from "@/lib/db";
import { marketingPreferences } from "@/lib/marketing-preferences";
import { MarketingPreferencesForm } from "./marketing-preferences-form";
import { ProfessionalNotificationSettings } from "./professional-notification-settings";
import type { PushDevice } from "@/modules/notifications/professional-repository";
import type { NotificationPreference } from "@/modules/notifications/preferences";

export async function CommunicationsSettings({ authId, professional = false }: { authId: string; professional?: boolean }) {
  const [alerts, marketing] = await Promise.allSettled([
    withIdentity(authId, async db => (await db.query<{data:{preferences:NotificationPreference[];devices:PushDevice[]}}>(professional ? "SELECT beauty.my_notification_settings() AS data" : "SELECT beauty.customer_notification_settings() AS data")).rows[0]?.data),
    withIdentity(authId, async db => (await db.query<{data:Record<string,boolean>}>("SELECT beauty.my_marketing_preferences() AS data")).rows[0]?.data),
  ]);
  return <div className="communications-settings">
    <nav className="workspace-section-links" aria-label="Communication settings sections">
      <a href="#activity">Activity & delivery</a><a href="#marketing">Optional marketing</a>
      <Link href={professional ? "/notifications?view=professional" : "/notifications"}>Open notification inbox →</Link>
    </nav>
    <section id="activity" className="communications-section">
      <p className="eyebrow">ACTIVITY & DELIVERY</p><h2>Activity alerts</h2>
      <p>Manage service alerts here; marketing choices are separate below.</p>
      <p>Choose email and supported device alerts. SMS settings are not available here.</p>
      {alerts.status === "fulfilled" && alerts.value ? <ProfessionalNotificationSettings audience={professional ? "professional" : "customer"} initial={alerts.value} publicKey={process.env.VAPID_PUBLIC_KEY || null} pushConfigured={Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)} /> : <p role="alert">We couldn’t load your alert settings. Reload to try again. Your saved choices have not changed.</p>}
    </section>
    <section id="marketing" className="communications-section">
      <p className="eyebrow">OPTIONAL MARKETING</p><h2>Marketing emails</h2>
      <p>Choose optional promotional emails. Opting out does not stop essential service notices.</p>
      {marketing.status === "fulfilled" && marketing.value ? <MarketingPreferencesForm initial={marketingPreferences(marketing.value)} professional={professional} /> : <p role="alert">We couldn’t load your marketing choices. Reload to try again. Your existing consent has not changed.</p>}
    </section>
  </div>;
}
