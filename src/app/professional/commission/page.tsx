import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalCommissionPanel } from "@/components/professional-commission-panel";
import { myCommissionOverview } from "@/modules/commission/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your commission · GLOHAUS PRO" };
export default async function Page() {
  const result = await pageAccount("professional");
  if (!result.account) return <AccessMessage code={result.error} />;
  const data = await withIdentity(result.account.authId, myCommissionOverview);
  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="wallet"
        displayName={result.account.displayName}
      />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">GLOHAUS PRO</p>
        <h1>Your commission and founding rewards.</h1>
        <ProfessionalCommissionPanel data={data} />
      </main>
    </div>
  );
}
