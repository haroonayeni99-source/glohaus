import { MarketplaceSidebar, MarketplaceCategoryStrip } from "@/components/marketplace-navigation";
import { z } from "zod";
import {
  catalogueProducts,
  shopCollection,
  shopCollections,
} from "@/modules/shop/catalogue";
import { publicMetadata, publicPages } from "@/lib/public-seo";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { BottomNavigation } from "@/components/bottom-navigation";
import { PublicHeader } from "@/components/public-header";
import { withIdentity } from "@/lib/db";
import { productCategories, publicProducts } from "@/modules/shop/repository";
import { money } from "@/modules/professionals/domain";
import { publicViewerSignedIn } from "@/lib/public-viewer";
import { ShopCatalogueRetry } from "@/components/shop-catalogue-retry";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    categoryId?: string | string[];
    collection?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const categoryId = z.uuid().safeParse(params.categoryId).success
    ? (params.categoryId as string)
    : undefined;
  const collection = shopCollection(params.collection);
  const selectedCollection = collection
    ? shopCollections[collection]
    : undefined;
  const viewerSignedIn = await publicViewerSignedIn();
  const cartHref = viewerSignedIn ? "/cart" : "/sign-in?returnTo=%2Fcart";
  let categories: Awaited<ReturnType<typeof productCategories>> = [];
  let products: Awaited<ReturnType<typeof publicProducts>> = [];
  let loadFailed = !process.env.DATABASE_URL;
  if (process.env.DATABASE_URL) {
    try {
      const catalogue = await withIdentity("", async (db) => ({
        categories: await productCategories(db),
        products: await publicProducts(db, {
          query: q,
          collection,
          categoryId,
        }),
      }));
      categories = catalogue.categories;
      products = catalogue.products;
    } catch (error) {
      loadFailed = true;
      console.error("Shop catalogue unavailable", {
        type: error instanceof Error ? error.name : "UnknownError",
        code:
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code ?? "")
            : "",
      });
    }
  }
  const selectedCategory = categories.find((c) => c.id === categoryId);

  const query = q.trim().toLowerCase();
  const visibleProducts = catalogueProducts(products, q, collection);
  const bestsellers = products.slice(0, 5);

  return (
    <>
      <PublicHeader signedIn={viewerSignedIn} />
      <main id="main" className="marketplace-shell">
        <MarketplaceSidebar categories={categories} collection={collection} q={q} categoryId={categoryId} />

        <section className="marketplace-main">
          <form className="marketplace-search" action="/shop" method="get">
            {categoryId && (
              <input type="hidden" name="categoryId" value={categoryId} />
            )}
            {collection && (
              <input type="hidden" name="collection" value={collection} />
            )}
            <Search size={18} aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search products, sellers or categories..."
              aria-label="Search marketplace"
            />
            <button type="submit">Search</button>
          </form>

          <section className="marketplace-hero">
            <div className="marketplace-hero-copy">
              <p className="eyebrow">GLOHAUS MARKETPLACE</p>
              <h1>
                The Beauty <span>Marketplace</span>
              </h1>
              <p>
                Shop hair, makeup, skincare, nails and more from the
                professionals behind the look.
              </p>
              <div className="marketplace-hero-actions">
                <a href="#products">
                  Shop all products <ArrowRight size={16} />
                </a>
                <a href="#categories">Shop by category</a>
                <Link href={cartHref}>
                  <ShoppingBag size={16} aria-hidden /> Cart
                </Link>
              </div>
            </div>
            <div className="marketplace-hero-art" aria-hidden>
              <span className="marketplace-orb marketplace-orb-one" />
              <span className="marketplace-orb marketplace-orb-two" />
              <span className="marketplace-orb marketplace-orb-three" />
              <div className="marketplace-beauty-mark">G</div>
            </div>
            <div className="marketplace-hero-benefits">
              <span>
                <Sparkles size={15} /> Curated beauty products
              </span>
              <span>
                <ShieldCheck size={15} /> Marketplace protection
              </span>
              <span>
                <Truck size={15} /> Seller-managed shipping
              </span>
            </div>
          </section>

          <MarketplaceCategoryStrip categories={categories} collection={collection} q={q} categoryId={categoryId} />

          <section id="products" className="marketplace-products-section">
            <div className="marketplace-section-heading">
              <div>
                <p className="eyebrow">
                  {selectedCollection
                    ? "SHOP BY"
                    : query
                      ? "SEARCH RESULTS"
                      : "MARKETPLACE"}
                </p>
                <h2>
                  {selectedCollection
                    ? `${selectedCollection.label}${query ? ` for “${q}”` : ""}`
                    : selectedCategory
                      ? selectedCategory.name
                      : query
                        ? `Results for “${q}”`
                        : "Popular products"}
                </h2>
                {selectedCollection && <p>{selectedCollection.description}</p>}
              </div>
              {(query || collection || categoryId) && (
                <Link href="/shop#products">Clear filters</Link>
              )}
            </div>

            {loadFailed ? (
              <section className="marketplace-empty" role="alert">
                <ShoppingBag size={30} aria-hidden />
                <div>
                  <h3>The marketplace couldn’t load.</h3>
                  <p>
                    Products are temporarily unavailable. Please try again in a
                    moment.
                  </p>
                </div>
                <ShopCatalogueRetry />
              </section>
            ) : visibleProducts.length ? (
              <div
                className="marketplace-product-grid"
                aria-label="Published products"
              >
                {visibleProducts.map((product) => (
                  <article
                    className="marketplace-product-card"
                    key={product.id}
                  >
                    <div className="marketplace-product-image">
                      {product.image_asset_id ? (
                        <Image
                          fill
                          unoptimized
                          sizes="(max-width: 700px) 50vw, 230px"
                          src={`/api/media/${product.image_asset_id}`}
                          alt={product.name}
                        />
                      ) : (
                        <span
                          className="marketplace-product-placeholder"
                          aria-hidden
                        >
                          <ShoppingBag size={34} />
                        </span>
                      )}
                      <span className="marketplace-heart" aria-hidden>
                        <Heart size={17} />
                      </span>
                      <span
                        className={
                          product.in_stock && !product.seller_away
                            ? "marketplace-stock"
                            : "marketplace-stock is-out"
                        }
                      >
                        {product.seller_away ? "Seller away" : product.in_stock ? "In stock" : "Out of stock"}
                      </span>
                    </div>
                    <div className="marketplace-product-copy">
                      <Link
                        className="marketplace-seller"
                        href={`/p/${product.professional_slug}`}
                      >
                        {product.professional_name}
                      </Link>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <div className="marketplace-rating">
                        <Star size={13} fill="currentColor" /> New marketplace
                        listing
                      </div>
                      <div className="marketplace-product-buy">
                        <div>
                          {(product.compare_at_price_pence ?? 0) >
                            product.price_pence && (
                            <>
                              <del aria-label="Previous selling price">
                                {money(product.compare_at_price_pence!)}
                              </del>
                              <span>
                                {" "}
                                Save{" "}
                                {money(
                                  product.compare_at_price_pence! -
                                    product.price_pence,
                                )}
                              </span>
                              <br />
                            </>
                          )}
                          <strong>{money(product.price_pence)}</strong>
                        </div>
                        <AddToCartButton
                          productId={product.id}
                          disabled={!product.in_stock || product.seller_away}
                          disabledLabel={product.seller_away ? "Seller away" : "Out of stock"}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="marketplace-empty">
                <PackageCheck size={30} aria-hidden />
                <div>
                  <h3>
                    {collection === "deals"
                      ? "No offers available right now."
                      : collection === "bestsellers" ||
                          collection === "trending"
                        ? "No paid sales to show yet."
                        : categoryId || query
                          ? "No matching products yet."
                          : "Marketplace products are coming in."}
                  </h3>
                  <p>
                    {collection
                      ? "Try clearing the filters or browse all products."
                      : categoryId || query
                        ? "Try another category or search term."
                        : "Real products will appear here as GLOHAUS professionals publish stock. We do not show fake listings or placeholder prices."}
                  </p>
                </div>
                {query || collection || categoryId ? (
                  <Link href="/shop">Show all products</Link>
                ) : (
                  <Link href="/explore">Explore professionals</Link>
                )}
              </section>
            )}
          </section>

          <section className="marketplace-protection-note">
            <ShieldCheck size={20} aria-hidden />
            <div>
              <strong>Shopping with GLOHAUS</strong>
              <p>
                Sign in to build your basket and see the available checkout
                options. Review your total and delivery details before paying.
                Sellers prepare and ship their orders. For help with an order,
                <Link href="/contact"> contact GLOHAUS support</Link> or read
                our{" "}
                <Link href="/refunds">cancellations and refunds guidance</Link>.
              </p>
            </div>
          </section>
        </section>

        <aside className="marketplace-right-rail">
          <article className="marketplace-offer-card">
            <p>NEW TO GLOHAUS?</p>
            <strong>
              Discover products from independent beauty professionals.
            </strong>
            <span>Build your basket as the marketplace grows.</span>
            <a href="#products">
              Browse now <ArrowRight size={14} />
            </a>
          </article>

          <article className="marketplace-deal-card">
            <span className="eyebrow">MARKETPLACE SPOTLIGHT</span>
            <div className="marketplace-deal-art">
              <ShoppingBag size={34} />
            </div>
            <strong>Beauty products, all in one place.</strong>
            <p>Hair, skincare, tools, lashes, makeup and more.</p>
          </article>

          <article className="marketplace-bestsellers">
            <div className="marketplace-rail-heading">
              <strong>Featured products</strong>
              <a href="#products">View all →</a>
            </div>
            {loadFailed ? (
              <p>Featured products are temporarily unavailable.</p>
            ) : bestsellers.length ? (
              bestsellers.map((product, index) => (
                <Link
                  key={product.id}
                  href="#products"
                  className="marketplace-bestseller-row"
                >
                  <span className="marketplace-rank">{index + 1}</span>
                  <span className="marketplace-rank-thumb">
                    {product.image_asset_id ? (
                      <Image
                        fill
                        unoptimized
                        sizes="46px"
                        src={`/api/media/${product.image_asset_id}`}
                        alt=""
                      />
                    ) : (
                      <ShoppingBag size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{product.name}</strong>
                    <small>{product.professional_name}</small>
                  </span>
                  <em>{money(product.price_pence)}</em>
                </Link>
              ))
            ) : (
              <p className="marketplace-rail-empty">
                Featured products will appear as sellers publish stock.
              </p>
            )}
          </article>
        </aside>
      </main>
      <BottomNavigation active="shop" signedIn={viewerSignedIn} />
    </>
  );
}

export const metadata = publicMetadata("/shop", ...publicPages["/shop"]);
