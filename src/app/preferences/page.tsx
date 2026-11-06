import { PublicHeader } from "@/components/public-header";
import { CommunicationsSettings } from "@/components/communications-settings";
import { redirect } from "next/navigation";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
export const dynamic = "force-dynamic";
export default async function MarketingPreferencesPage() {
  const result = await pageAccount();
  if (!result.account) return <div className="standalone-message"><AccessMessage code={result.error} /></div>;
  if (!result.account.roles.includes("customer") && !result.account.roles.includes("professional")) return <><PublicHeader signedIn /><main id="main" className="customer-account-page communications-page"><h1>Notifications & Communications</h1><CommunicationsSettings authId={result.account.authId} /></main></>;
  redirect(`${result.account.roles.includes("professional") ? "/professional/settings/notifications" : "/account/notifications"}#marketing`);
}
