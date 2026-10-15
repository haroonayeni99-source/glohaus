import { taxonomyCatalog,mySelection,serviceOptions } from "@/modules/taxonomy/repository";
import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalEditor } from "@/components/professional-editor";
import type { Service } from "@/modules/professionals/domain";
import { publicCategories } from "@/modules/platform/repository";
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
  const [data, marketplaceCategories] = await Promise.all([
    withIdentity(account.authId, async (db) => ({
    taxonomy:await taxonomyCatalog(db),selection:await mySelection(db),options:await serviceOptions(db,account.professionalId!),
    access: (
      await db.query<{
        data: {
          status: "unverified" | "pending" | "verified" | "restricted";
          starterBookingsRemaining: number | null;
        };
      }>("SELECT beauty.professional_access_state($1) AS data", [
        account.professionalId,
      ])
    ).rows[0].data,
    services: (
      await db.query<Service>(
        "SELECT s.*,a.media_type AS asset_media_type,sp.name AS speciality_name FROM beauty.services s LEFT JOIN beauty.portfolio_assets a ON a.id=s.asset_id LEFT JOIN beauty.specialities sp ON sp.id=s.speciality_id WHERE s.professional_id=$1 ORDER BY s.created_at,s.id",
        [account.professionalId],
      )
    ).rows,
    assets: (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC",
        [account.professionalId],
      )
    ).rows,
    })),
    publicCategories(),
  ]);
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
            services={data.services.map(s=>({...s,options:data.options.filter(o=>o.service_id===s.id)}))}
            taxonomy={data.taxonomy} selection={data.selection}
            assets={data.assets}
            verificationStatus={data.access.status}
            starterBookingsRemaining={data.access.starterBookingsRemaining}
            marketplaceCategories={marketplaceCategories}
          />
        </section>
      </main>
    </div>
  );
}
