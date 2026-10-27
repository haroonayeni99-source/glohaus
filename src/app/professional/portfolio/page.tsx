export const dynamic = "force-dynamic";

import { taxonomyCatalog,mySelection } from "@/modules/taxonomy/repository";
import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { AccessMessage } from "@/components/access-message";
import {
  PortfolioEditor,
  type PortfolioAsset,
} from "@/components/portfolio-editor";
export default async function Portfolio() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const account = result.account;
  const assets = await withIdentity(
    account.authId,
    async (db) =>
      (
        await db.query<PortfolioAsset>(
          "SELECT a.id,alt_text,publication_status,media_type,mime_type,ARRAY(SELECT speciality_id FROM beauty.portfolio_specialities WHERE asset_id=a.id) AS speciality_ids FROM beauty.portfolio_assets a WHERE professional_id=$1 ORDER BY created_at DESC",
          [account.professionalId],
        )
      ).rows,
  );
  const specialities=await withIdentity(account.authId,async db=>{const c=await taxonomyCatalog(db);const s=await mySelection(db);return c.specialities.filter(x=>s.specialityIds.includes(x.id));});
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <Link href="/professional" className="pro-back-link">← Dashboard</Link>
        <p className="pro-kicker">A LITTLE OF WHAT YOU DO BEST</p>
        <h1>Your portfolio, your signature.</h1>
        <p><Link href="/professional/connections#social">Connect social media or add post links →</Link></p>
        <p className="pro-page-lead">
          Uploaded images and videos stay private until you publish them. Your professional
          profile must also be published.
        </p>
        <section className="pro-editor-surface">
          <PortfolioEditor assets={assets} specialities={specialities}/>
        </section>
      </main>
    </div>
  );
}
