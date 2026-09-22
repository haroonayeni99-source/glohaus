import Link from "next/link";
import { ShoppingBag, Sparkles } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { PublicHeader } from "@/components/public-header";

export const metadata = { title: "Shop" };

/**
 * Shop navigation is live before product and fulfilment data are released.
 * There are deliberately no sample products or purchase actions here: product
 * prices, stock, delivery and checkout must come from authorised records.
 */
export default function ShopPage() {
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page shop-prelaunch">
        <p className="eyebrow">GLOHAUS SHOP</p>
        <h1>
          The beauty products behind the <em>look.</em>
        </h1>
        <p className="lead">
          GLOHAUS Shop will connect trusted products to the professionals and
          services you discover here.
        </p>
        <section className="shop-prelaunch-card">
          <ShoppingBag size={29} aria-hidden />
          <div>
            <h2>Product discovery is preparing.</h2>
            <p>
              Products will appear only once stock, delivery tracking and a
              secure marketplace checkout are ready. No placeholder prices or
              payments are shown.
            </p>
          </div>
          <Link className="button" href="/explore">
            Find beauty professionals <Sparkles size={17} aria-hidden />
          </Link>
        </section>
      </main>
      <BottomNavigation active="shop" />
    </>
  );
}
