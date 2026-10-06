export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ProductOrderList } from "@/components/product-order-list";
import { professionalProductOrders } from "@/modules/shop/repository";

export const metadata = { title: "Shop orders · GLOHAUS PRO" };

export default async function ProfessionalOrdersPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const orders = await withIdentity(result.account.authId, (db) =>
    professionalProductOrders(db, result.account.professionalId!),
  );

  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="more"
        displayName={result.account.displayName}
      />
      <main id="main" className="pro-main pro-management-page product-orders-page">
        <p className="pro-kicker">SHOP FULFILMENT</p>
        <h1>Product orders</h1>
        <p className="pro-page-lead">
          Paid orders appear here as they are confirmed. Mark orders as processing,
          add tracking when you dispatch them, or start a refund before shipment when needed.
        </p>
        <ProductOrderList initialOrders={orders} mode="professional" />
      </main>
    </div>
  );
}
