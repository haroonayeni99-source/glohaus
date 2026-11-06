import { WorkspaceIntro } from "@/components/workspace-intro";
export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ProductOrderList } from "@/components/product-order-list";
import { customerProductOrders } from "@/modules/shop/repository";

export const metadata = { title: "Shop orders" };

export default async function CustomerOrdersPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const orders = await withIdentity(result.account.authId, (db) =>
    customerProductOrders(db, result.account.id),
  );

  return (
    <>
      <PublicHeader signedIn />
      <main id="main" className="catalog-page product-orders-page">
        <WorkspaceIntro eyebrow="SHOP ORDERS" title="Your product orders."><p>Track your GLOHAUS Shop purchases, shipping updates, delivery and refunds in one place.</p></WorkspaceIntro>
        <ProductOrderList initialOrders={orders} mode="customer" />
      </main>
      <BottomNavigation active="profile" signedIn />
    </>
  );
}
