import { taxonomyCatalog } from "@/modules/taxonomy/repository";
import { emptyTaxonomy } from "@/modules/taxonomy/domain";
import { publicMetadata, publicPages } from "@/lib/public-seo";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { withIdentity } from "@/lib/db";
import {
  discoveryOptions,
  discoveryHref,
} from "@/modules/professionals/discovery";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const dynamic = "force-dynamic";

export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;categoryId?:string;specialityId?:string;templateId?:string;date?:string;
    price?: string;
    rating?: string;
    after?: string;
    verified?: string;
    under50?: string;
    topRated?: string;
    travels?: string;
    today?: string;
  }>;
}) {
  const { query: q, filters, after } = discoveryOptions(await searchParams);
  const viewerSignedIn = await publicViewerSignedIn();

  let taxonomy=emptyTaxonomy;
  let next: string | null = null;
  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const result = await withIdentity("", (db) =>
        discoveryPage(db, q, after, filters),
      );
      professionals = result.professionals;
      next = result.next;
      taxonomy=await withIdentity("",db=>taxonomyCatalog(db));
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      const details =
        typeof error === "object" && error !== null
          ? (error as {
              table?: unknown;
              schema?: unknown;
              routine?: unknown;
              message?: unknown;
            })
          : {};
      console.error("Professional discovery unavailable", {
        type: error instanceof Error ? error.name : "UnknownError",
        code,
        table: String(details.table ?? ""),
        schema: String(details.schema ?? ""),
        routine: String(details.routine ?? ""),
        message: String(details.message ?? "").slice(0, 180),
      });
    }
  }

  return (
    <>
      <PublicHeader signedIn={viewerSignedIn} />
      <main id="main">
        <ExploreMapExperience
          key={JSON.stringify({ q, filters })}
          professionals={professionals}
          taxonomy={taxonomy}
          query={q}
          filters={filters}
        />
        {(after || next) && (
          <nav
            className="map-pagination"
            aria-label="Professional search pages"
          >
            {after && (
              <Link href={discoveryHref(q, filters)}>
                ← Back to first results
              </Link>
            )}
            {next && (
              <Link href={discoveryHref(q, filters, next)}>
                More professionals →
              </Link>
            )}
          </nav>
        )}
      </main>
      <BottomNavigation active="search" signedIn={viewerSignedIn} />
    </>
  );
}

export const metadata = publicMetadata("/explore", ...publicPages["/explore"]);
