export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { MarketingPreferencesForm } from "@/components/marketing-preferences-form";

export default async function MarketingPreferencesPage() {
  const result = await pageAccount();
  if (!result.account) return <div className="standalone-message"><AccessMessage code={result.error} /></div>;
  const account = result.account;
  const preferences = await withIdentity(
    account.authId,
    async (db) =>
      (
        await db.query<{ data: Record<string, boolean> }>(
          "SELECT beauty.my_marketing_preferences() AS data",
        )
      ).rows[0]?.data ?? {},
  );

  const professional = account.roles.includes("professional");
  const content = (
    <main id="main" className={professional ? "pro-main pro-management-page" : "customer-account-page"}>
      <p className="eyebrow">EMAIL PREFERENCES</p>
      <h1>Choose what GLOHAUS sends you.</h1>
      <p className="lead">
        Marketing is optional. Booking, order, security, verification and payout emails stay separate and may still be sent when needed.
      </p>
      <MarketingPreferencesForm initial={preferences} professional={professional} />
    </main>
  );

  return professional ? (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      {content}
    </div>
  ) : (
    <>
      <PublicHeader signedIn />
      {content}
    </>
  );
}
