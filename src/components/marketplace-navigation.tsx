import Link from "next/link";
import { ArrowRight, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { shopCollection, shopCollections, shopHref, type ShopCollection } from "@/modules/shop/catalogue";

type NavigationProps = {
  categories: { id: string; name: string }[];
  collection?: ShopCollection;
  q: string;
  categoryId?: string;
};

export function MarketplaceSidebar({ categories, collection, q, categoryId }: NavigationProps) {
  return (
        <aside
          className="marketplace-sidebar"
          aria-label="Marketplace categories"
        >
          <Link className="marketplace-sidebar-active" href="/shop">
            <ShoppingBag size={17} aria-hidden /> Shop all
          </Link>

          <p className="marketplace-side-label">Categories</p>
          <nav>
            {categories.map(({ id, name }) => (
              <Link
                key={id}
                href={shopHref(collection, q, id)}
                aria-current={categoryId === id ? "page" : undefined}
              >
                <Sparkles size={15} aria-hidden /> {name}
              </Link>
            ))}
          </nav>

          <div className="marketplace-side-divider" />
          <p className="marketplace-side-label">Shop by</p>
          <nav>
            {Object.entries(shopCollections).map(([key, { label: name }]) => (
              <Link
                key={name}
                href={shopHref(shopCollection(key), q, categoryId)}
                aria-current={collection === key ? "page" : undefined}
              >
                <Tag size={15} aria-hidden /> {name}
              </Link>
            ))}
            <Link href={shopHref(undefined, "Gift")}>
              <Tag size={15} aria-hidden /> Gift sets
            </Link>
          </nav>

          <article className="marketplace-side-promo">
            <Sparkles size={22} aria-hidden />
            <strong>Beauty essentials</strong>
            <span>
              Products from GLOHAUS professionals and approved sellers.
            </span>
            <a href="#products">
              Shop products <ArrowRight size={14} />
            </a>
          </article>
        </aside>
  );
}

export function MarketplaceCategoryStrip({ categories, collection, q, categoryId }: NavigationProps) {
  return (
          <section
            id="categories"
            className="marketplace-category-strip"
            aria-label="Product categories"
          >
            {categories.map(({ id, name }, index) => (
              <Link
                key={id}
                href={shopHref(collection, q, id)}
                aria-current={categoryId === id ? "page" : undefined}
                className={`marketplace-category marketplace-category-${index + 1}`}
              >
                <div className="marketplace-category-art">
                  <Sparkles size={26} aria-hidden />
                </div>
                <span>
                  <strong>{name}</strong>
                  <small>Browse {name.toLowerCase()} products</small>
                </span>
                <i>
                  <ArrowRight size={14} />
                </i>
              </Link>
            ))}
          </section>
  );
}
