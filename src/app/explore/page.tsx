import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { withIdentity } from "@/lib/db";
import { discoveryOptions } from "@/modules/professionals/discovery";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a Professional | GLOHAUS" };

export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string; verified?: string; under50?: string; topRated?: string; travels?: string; today?: string }>;
}) {
  const { query: q, filters, after } = discoveryOptions(await searchParams);
  const viewerSignedIn = await publicViewerSignedIn();

  let next: string | null = null;
  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const result = await withIdentity("", (db) => discoveryPage(db, q, after, filters));
      professionals = result.professionals;
      next = result.next;
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
        <ExploreMapExperience professionals={professionals} query={q} filters={filters} />
        {(after || next) && (
          <nav className="map-pagination" aria-label="Professional search pages">
            {after && (
              <Link href={(() => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (filters.verified) params.set("verified", "1");
                if (filters.under50) params.set("under50", "1");
                if (filters.topRated) params.set("topRated", "1");
                if (filters.travels) params.set("travels", "1");
                if (filters.availableToday) params.set("today", "1");
                const value = params.toString();
                return value ? `/explore?${value}` : "/explore";
              })()}>
                ← Back to first results
              </Link>
            )}
            {next && (
              <Link href={(() => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (filters.verified) params.set("verified", "1");
                if (filters.under50) params.set("under50", "1");
                if (filters.topRated) params.set("topRated", "1");
                if (filters.travels) params.set("travels", "1");
                if (filters.availableToday) params.set("today", "1");
                params.set("after", next);
                return `/explore?${params.toString()}`;
              })()}>
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
