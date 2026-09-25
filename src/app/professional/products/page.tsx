export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProfessionalProductsManager } from "@/components/professional-products-manager";
import { professionalProducts } from "@/modules/shop/repository";

export const metadata = { title: "Products · GLOHAUS PRO" };

export default async function ProfessionalProductsPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const account = result.account;
  const data = await withIdentity(account.authId, async (db) => ({
    products: await professionalProducts(db, account.professionalId!),
    assets: (
      await db.query<{ id: string; alt_text: string }>(
        "SELECT id,alt_text FROM beauty.portfolio_assets WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 100",
        [account.professionalId],
      )
    ).rows,
  }));

  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">YOUR SHOP</p>
        <h1>Products & stock</h1>
        <p className="pro-page-lead">
          Publish products only when the price and stock are accurate. Exact
          stock and SKU remain private to your professional workspace.
        </p>
        <ProfessionalProductsManager
          initialProducts={data.products}
          assets={data.assets}
        />
      </main>
    </div>
  );
}
