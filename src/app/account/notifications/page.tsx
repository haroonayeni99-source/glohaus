import { WorkspaceIntro } from "@/components/workspace-intro";
import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { CommunicationsSettings } from "@/components/communications-settings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications & Communications" };
export default async function CustomerNotificationSettingsPage() {
  const result = await pageAccount("customer");
  if (!result.account) return <main id="main" className="standalone-message"><AccessMessage code={result.error} /></main>;
  return <><PublicHeader signedIn /><main id="main" className="customer-account-page communications-page">
    <Link href="/account">← Your account</Link><WorkspaceIntro eyebrow="YOUR PREFERENCES" title="Notifications & Communications"><p>Manage alerts, marketing emails and connected devices.</p></WorkspaceIntro>
    <CommunicationsSettings authId={result.account.authId} />
  </main></>;
}
