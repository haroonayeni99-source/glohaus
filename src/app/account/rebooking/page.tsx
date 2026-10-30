import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { CustomerRebookingControls } from "@/components/rebooking-scope-controls";
import type { CustomerRebookingScope } from "@/modules/rebooking/scope";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Rebooking email choices",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const access = await pageAccount(undefined, "/account/rebooking");
  if (!access.account) return <AccessMessage code={access.error} />;
  const data = await withIdentity(
    access.account.authId,
    async (db) =>
      (
        await db.query<{ data: CustomerRebookingScope[] }>(
          "SELECT beauty.my_rebooking_consents() AS data",
        )
      ).rows[0].data,
  ).catch(() => null);
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" className="customer-account-page">
        <Link href="/preferences">← Email preferences</Link>
        <h1>Your rebooking email choices</h1>
        {data ? (
          <CustomerRebookingControls key={JSON.stringify(data)} scopes={data} />
        ) : (
          <p role="alert">
            Rebooking preferences are unavailable. No consent has been changed.
          </p>
        )}
      </main>
    </>
  );
}
