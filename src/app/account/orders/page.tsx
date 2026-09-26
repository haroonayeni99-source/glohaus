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
      <PublicHeader />
      <main id="main" className="catalog-page product-orders-page">
        <p className="eyebrow">SHOP ORDERS</p>
        <h1>Your product orders.</h1>
        <p className="lead">
          Track paid marketplace purchases and delivery progress in one place.
        </p>
        <ProductOrderList initialOrders={orders} mode="customer" />
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
