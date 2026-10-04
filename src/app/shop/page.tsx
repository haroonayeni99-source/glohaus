import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Star,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { BottomNavigation } from "@/components/bottom-navigation";
import { PublicHeader } from "@/components/public-header";
import { withIdentity } from "@/lib/db";
import { publicProducts } from "@/modules/shop/repository";
import { money } from "@/modules/professionals/domain";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketplace" };

const categories = [
  ["Hair", "Wigs, bundles, care"],
  ["Nails", "Polish, sets, tools"],
  ["Makeup", "Palettes, lips, face"],
  ["Skincare", "Serums, creams, glow"],
  ["Barber", "Grooming & clippers"],
  ["Lashes", "Kits & extensions"],
  ["Tools", "Brushes & devices"],
  ["Fragrance", "Perfume & body mist"],
] as const;

const shopBy = ["New arrivals", "Bestsellers", "Trending", "Deals & offers", "Gift sets"] as const;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const viewerSignedIn = await publicViewerSignedIn();
  const cartHref = viewerSignedIn ? "/cart" : "/sign-in?returnTo=%2Fcart";
  const products = process.env.DATABASE_URL
    ? await withIdentity("", publicProducts).catch(() => [])
    : [];

  const query = q.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter((product) =>
        [product.name, product.description, product.professional_name]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : products;
  const bestsellers = products.slice(0, 5);

  return (
    <>
      <PublicHeader signedIn={viewerSignedIn} />
      <main id="main" className="marketplace-shell">
        <aside className="marketplace-sidebar" aria-label="Marketplace categories">
          <Link className="marketplace-sidebar-active" href="/shop">
            <ShoppingBag size={17} aria-hidden /> Shop all
          </Link>

          <p className="marketplace-side-label">Categories</p>
          <nav>
            {categories.map(([name]) => (
              <Link key={name} href={`/shop?q=${encodeURIComponent(name)}#products`}>
                <Sparkles size={15} aria-hidden /> {name}
              </Link>
            ))}
          </nav>

          <div className="marketplace-side-divider" />
          <p className="marketplace-side-label">Shop by</p>
          <nav>
            {shopBy.map((name) => (
              <Link key={name} href={`/shop?q=${encodeURIComponent(name.split(" ")[0])}#products`}>
                <Tag size={15} aria-hidden /> {name}
              </Link>
            ))}
          </nav>

          <article className="marketplace-side-promo">
            <Sparkles size={22} aria-hidden />
            <strong>Beauty essentials</strong>
            <span>Products from GLOHAUS professionals and approved sellers.</span>
            <a href="#products">Shop products <ArrowRight size={14} /></a>
          </article>
        </aside>

        <section className="marketplace-main">
          <form className="marketplace-search" action="/shop" method="get">
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
              <h1>The Beauty <span>Marketplace</span></h1>
              <p>Shop hair, makeup, skincare, nails and more from the professionals behind the look.</p>
              <div className="marketplace-hero-actions">
                <a href="#products">Shop all products <ArrowRight size={16} /></a>
                <a href="#categories">Shop by category</a>
              </div>
            </div>
            <div className="marketplace-hero-art" aria-hidden>
              <span className="marketplace-orb marketplace-orb-one" />
              <span className="marketplace-orb marketplace-orb-two" />
              <span className="marketplace-orb marketplace-orb-three" />
              <div className="marketplace-beauty-mark">G</div>
            </div>
            <div className="marketplace-hero-benefits">
              <span><Sparkles size={15} /> Curated beauty products</span>
              <span><ShieldCheck size={15} /> Marketplace protection</span>
              <span><Truck size={15} /> Seller-managed shipping</span>
            </div>
          </section>

          <section id="categories" className="marketplace-category-strip" aria-label="Product categories">
            {categories.map(([name, description], index) => (
              <Link key={name} href={`/shop?q=${encodeURIComponent(name)}#products`} className={`marketplace-category marketplace-category-${index + 1}`}>
                <div className="marketplace-category-art"><Sparkles size={26} aria-hidden /></div>
                <span><strong>{name}</strong><small>{description}</small></span>
                <i><ArrowRight size={14} /></i>
              </Link>
            ))}
          </section>

          <section id="products" className="marketplace-products-section">
            <div className="marketplace-section-heading">
              <div>
                <p className="eyebrow">{query ? "SEARCH RESULTS" : "MARKETPLACE"}</p>
                <h2>{query ? `Results for “${q}”` : "Popular products"}</h2>
              </div>
              {query && <Link href="/shop#products">Clear search</Link>}
            </div>

            {visibleProducts.length ? (
              <div className="marketplace-product-grid" aria-label="Published products">
                {visibleProducts.map((product) => (
                  <article className="marketplace-product-card" key={product.id}>
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
                        <span className="marketplace-product-placeholder" aria-hidden>
                          <ShoppingBag size={34} />
                        </span>
                      )}
                      <button type="button" className="marketplace-heart" aria-label={`Save ${product.name}`}>
                        <Heart size={17} aria-hidden />
                      </button>
                      <span className={product.in_stock ? "marketplace-stock" : "marketplace-stock is-out"}>
                        {product.in_stock ? "In stock" : "Out of stock"}
                      </span>
                    </div>
                    <div className="marketplace-product-copy">
                      <Link className="marketplace-seller" href={`/p/${product.professional_slug}`}>
                        {product.professional_name}
                      </Link>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <div className="marketplace-rating"><Star size={13} fill="currentColor" /> New marketplace listing</div>
                      <div className="marketplace-product-buy">
                        <strong>{money(product.price_pence)}</strong>
                        <AddToCartButton productId={product.id} disabled={!product.in_stock} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="marketplace-empty">
                <PackageCheck size={30} aria-hidden />
                <div>
                  <h3>{query ? "No matching products yet." : "Marketplace products are coming in."}</h3>
                  <p>
                    {query
                      ? "Try another category or search term."
                      : "Real products will appear here as GLOHAUS professionals publish stock. We do not show fake listings or placeholder prices."}
                  </p>
                </div>
                {query ? <Link href="/shop">Show all products</Link> : <Link href="/explore">Explore professionals</Link>}
              </section>
            )}
          </section>

          <section className="marketplace-protection-note">
            <ShieldCheck size={20} aria-hidden />
            <div>
              <strong>Protected marketplace rollout</strong>
              <p>Browsing and cart features are connected to real GLOHAUS product data. Checkout stays protected until order, delivery, refund and payment safeguards are fully ready.</p>
            </div>
          </section>
        </section>

        <aside className="marketplace-right-rail">
          <article className="marketplace-offer-card">
            <p>NEW TO GLOHAUS?</p>
            <strong>Discover products from independent beauty professionals.</strong>
            <span>Build your basket as the marketplace grows.</span>
            <a href="#products">Browse now <ArrowRight size={14} /></a>
          </article>

          <article className="marketplace-deal-card">
            <span className="eyebrow">MARKETPLACE SPOTLIGHT</span>
            <div className="marketplace-deal-art"><ShoppingBag size={34} /></div>
            <strong>Beauty products, all in one place.</strong>
            <p>Hair, skincare, tools, lashes, makeup and more.</p>
          </article>

          <article className="marketplace-bestsellers">
            <div className="marketplace-rail-heading">
              <strong>Featured products</strong>
              <a href="#products">View all →</a>
            </div>
            {bestsellers.length ? (
              bestsellers.map((product, index) => (
                <Link key={product.id} href="#products" className="marketplace-bestseller-row">
                  <span className="marketplace-rank">{index + 1}</span>
                  <span className="marketplace-rank-thumb">
                    {product.image_asset_id ? (
                      <Image fill unoptimized sizes="46px" src={`/api/media/${product.image_asset_id}`} alt="" />
                    ) : (
                      <ShoppingBag size={17} />
                    )}
                  </span>
                  <span><strong>{product.name}</strong><small>{product.professional_name}</small></span>
                  <em>{money(product.price_pence)}</em>
                </Link>
              ))
            ) : (
              <p className="marketplace-rail-empty">Featured products will appear as sellers publish stock.</p>
            )}
          </article>
        </aside>
      </main>
      <BottomNavigation active="shop" signedIn={viewerSignedIn} />
    </>
  );
}
