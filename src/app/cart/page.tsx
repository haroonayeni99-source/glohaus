export const dynamic = "force-dynamic";

import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { CartManager } from "@/components/cart-manager";
import { customerCart } from "@/modules/shop/repository";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const cart = await withIdentity(result.account.authId, (db) =>
    customerCart(db),
  );

  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page cart-page">
        <CartManager initialCart={cart} />
      </main>
      <BottomNavigation active="shop" />
    </>
  );
}
