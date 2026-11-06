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
  const social = await withIdentity(account.authId, async db => (await db.query<{total:number;drafts:number;published:number;hidden:number}>("SELECT count(*)::integer AS total,count(*) FILTER(WHERE publication_status='draft')::integer AS drafts,count(*) FILTER(WHERE publication_status='published')::integer AS published,count(*) FILTER(WHERE publication_status='hidden')::integer AS hidden FROM beauty.social_portfolio WHERE professional_id=$1",[account.professionalId])).rows[0]);
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
          Uploads stay private until both the content and your professional profile are published.
        </p>
        <section className="pro-editor-surface" aria-label="Linked social posts">
          <h2>Linked social posts · {social.total}</h2>
          <p>{social.drafts} draft · {social.published} published · {social.hidden} hidden. These posts stay on TikTok or Instagram and do not count as uploaded files.</p>
          <p>Your professional profile must also be published before customers can see published social posts.</p>
          <Link className="button" href="/professional/connections#posts">Preview &amp; manage social posts</Link>
        </section>
        <section className="pro-editor-surface" aria-label="Uploaded portfolio files">
          <h2>Uploaded photos &amp; videos</h2>
          <PortfolioEditor assets={assets} specialities={specialities}/>
        </section>
      </main>
    </div>
  );
}

