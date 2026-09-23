import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalEditor } from "@/components/professional-editor";
import type { Service } from "@/modules/professionals/domain";
export const dynamic = "force-dynamic";
export const metadata = { title: "Services & prices · GLOHAUS PRO" };
export default async function ServicesPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const data = await withIdentity(account.authId, async (db) => ({
    services: (
      await db.query<Service>(
        "SELECT * FROM beauty.services WHERE professional_id=$1 ORDER BY created_at,id",
        [account.professionalId],
      )
    ).rows,
    assets: (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
  }));
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link href="/professional/tools" className="pro-back-link">
          ← Business tools
        </Link>
        <p className="pro-kicker">YOUR BOOKABLE MENU</p>
        <h1>Services & prices</h1>
        <p className="pro-page-lead">
          Make it easy for clients to find their next appointment.
        </p>
        <section className="pro-editor-surface">
          <ProfessionalEditor
            section="services"
            services={data.services}
            assets={data.assets}
          />
        </section>
      </main>
    </div>
  );
}
