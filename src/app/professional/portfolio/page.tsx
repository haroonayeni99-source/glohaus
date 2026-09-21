export const dynamic = "force-dynamic";

import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
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
          "SELECT id,alt_text,publication_status FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC",
          [account.professionalId],
        )
      ).rows,
  );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link href="/professional" className="back-link">
          ← Your workspace
        </Link>
        <p className="eyebrow">A LITTLE OF WHAT YOU DO BEST</p>
        <h1>
          Your portfolio, <em>your signature.</em>
        </h1>
        <p className="lead">
          Uploaded images stay private until you publish them. Your professional
          profile must also be published.
        </p>
        <PortfolioEditor assets={assets} />
      </main>
    </>
  );
}
