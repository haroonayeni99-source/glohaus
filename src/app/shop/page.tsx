import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { BottomNavigation } from "@/components/bottom-navigation";
import { PublicHeader } from "@/components/public-header";
import { withIdentity } from "@/lib/db";
import { publicProducts } from "@/modules/shop/repository";
import { money } from "@/modules/professionals/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop" };

export default async function ShopPage() {
  const products = process.env.DATABASE_URL
    ? await withIdentity("", publicProducts).catch(() => [])
    : [];

  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page shop-catalogue">
        <div className="shop-heading-row">
          <p className="eyebrow">GLOHAUS SHOP</p>
          <Link className="shop-cart-link" href="/cart">
            <ShoppingBag size={16} aria-hidden /> Cart
          </Link>
        </div>
        <h1>
          Products from the professionals <em>behind the look.</em>
        </h1>
        <p className="lead">
          Browse real products published by GLOHAUS professionals. Checkout is
          not opened until marketplace orders, delivery and payment protection
          are fully connected.
        </p>

        {products.length ? (
          <section className="shop-product-grid" aria-label="Published products">
            {products.map((product) => (
              <article className="shop-product-card" key={product.id}>
                <div className="shop-product-image">
                  {product.image_asset_id ? (
                    <Image
                      fill
                      unoptimized
                      sizes="(max-width: 700px) 50vw, 280px"
                      src={`/api/media/${product.image_asset_id}`}
                      alt={product.name}
                    />
                  ) : (
                    <span aria-hidden>
                      <ShoppingBag size={32} />
                    </span>
                  )}
                  <span className={product.in_stock ? "in-stock" : "out-of-stock"}>
                    {product.in_stock ? "In stock" : "Out of stock"}
                  </span>
                </div>
                <div className="shop-product-copy">
                  <Link href={`/p/${product.professional_slug}`}>
                    {product.professional_name}
                  </Link>
                  <h2>{product.name}</h2>
                  <p>{product.description}</p>
                  <div className="shop-product-footer">
                    <strong>{money(product.price_pence)}</strong>
                    <Link href={`/p/${product.professional_slug}`}>
                      View professional <ArrowUpRight size={14} aria-hidden />
                    </Link>
                  </div>
                  <AddToCartButton
                    productId={product.id}
                    disabled={!product.in_stock}
                  />
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="shop-prelaunch-card">
            <ShoppingBag size={29} aria-hidden />
            <div>
              <h2>No published products yet.</h2>
              <p>
                Products will appear here as professionals publish real stock.
                No sample products or placeholder prices are shown.
              </p>
            </div>
            <Link className="button" href="/explore">
              Find beauty professionals <ArrowUpRight size={17} aria-hidden />
            </Link>
          </section>
        )}

        <section className="shop-checkout-note">
          <strong>Marketplace checkout is still protected.</strong>
          <p>
            Browsing and a persistent customer cart are live. Payment stays
            unavailable until orders, shipping state, refunds and secure
            payment capture are implemented together.
          </p>
        </section>
      </main>
      <BottomNavigation active="shop" />
    </>
  );
}
