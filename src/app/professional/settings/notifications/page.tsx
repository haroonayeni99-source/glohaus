import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { CommunicationsSettings } from "@/components/communications-settings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications & Communications · GLOHAUS PRO" };
export default async function NotificationSettingsPage() {
  const result = await pageAccount("professional");
  if (!result.account) return <div className="standalone-message"><AccessMessage code={result.error} /></div>;
  const account = result.account;
  return <div className="pro-app"><ProfessionalNavigation active="more" displayName={account.displayName} />
    <main id="main" className="pro-main pro-management-page communications-page">
      <Link className="pro-back-link" href="/professional/tools">← Business tools</Link><p className="pro-kicker">BUSINESS SETTINGS</p>
      <h1>Notifications & Communications</h1><p className="pro-page-lead">Business alerts, optional marketing and your connected devices.</p>
      <CommunicationsSettings authId={account.authId} professional />
    </main></div>;
}
