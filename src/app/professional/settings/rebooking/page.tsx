import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalRebookingControls } from "@/components/rebooking-scope-controls";
import type { ProfessionalRebookingScope } from "@/modules/rebooking/scope";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Rebooking reminder settings",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const access = await pageAccount(
    "professional",
    "/professional/settings/rebooking",
  );
  if (!access.account) return <AccessMessage code={access.error} />;
  const data = await withIdentity(
    access.account.authId,
    async (db) =>
      (
        await db.query<{ data: ProfessionalRebookingScope }>(
          "SELECT beauty.my_professional_rebooking() AS data",
        )
      ).rows[0].data,
  ).catch(() => null);
  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="more"
        displayName={access.account.displayName}
      />
      <main id="main" className="pro-main pro-management-page">
        <Link href="/professional/settings/notifications">← Notifications</Link>
        <h1>Rebooking reminders</h1>
        {data ? (
          <ProfessionalRebookingControls
            key={JSON.stringify(data)}
            settings={data}
          />
        ) : (
          <p role="alert">
            Rebooking settings are unavailable. Reminders have not been enabled.
          </p>
        )}
      </main>
    </div>
  );
}
