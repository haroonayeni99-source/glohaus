import "server-only";
import { unstable_cache } from "next/cache";
import { withIdentity } from "@/lib/db";
import { emptyTaxonomy } from "./domain";
import { taxonomyCatalog } from "./repository";
import type { TaxonomyCatalog } from "./domain";

export const publicTaxonomyTag = "public-taxonomy-catalog";
let loading: Promise<TaxonomyCatalog> | undefined;

// Only the anonymous, active category catalogue is shared. Accounts, follows,
// professional visibility, availability and financial data remain uncached.
const cachedCatalog = unstable_cache(
  () => {
    // Collapse simultaneous cold misses within each server instance as well.
    loading ??= withIdentity("", (db) => taxonomyCatalog(db, false)).finally(
      () => {
        loading = undefined;
      },
    );
    return loading;
  },
  ["public-taxonomy-catalog-v1"],
  { revalidate: 300, tags: [publicTaxonomyTag] },
);

export async function publicTaxonomyCatalog() {
  if (!process.env.DATABASE_URL) return emptyTaxonomy;
  // Errors propagate to the existing retry UI; never cache an empty fallback.
  return cachedCatalog();
}
