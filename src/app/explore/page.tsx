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
  searchParams: Promise<{ q?: string; after?: string }>;
}) {
  const { query: q, after } = discoveryOptions(await searchParams);
  const viewerSignedIn = await publicViewerSignedIn();

  let next: string | null = null;
  let professionals: PublicProfessional[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const result = await withIdentity("", (db) => discoveryPage(db, q, after));
      professionals = result.professionals;
      next = result.next;
    } catch {
      console.error("Professional discovery unavailable");
    }
  }

  return (
    <>
      <PublicHeader signedIn={viewerSignedIn} />
      <main id="main">
        <ExploreMapExperience professionals={professionals} query={q} />
        {(after || next) && (
          <nav className="map-pagination" aria-label="Professional search pages">
            {after && (
              <Link href={`/explore?q=${encodeURIComponent(q)}`}>
                ← Back to first results
              </Link>
            )}
            {next && (
              <Link
                href={`/explore?q=${encodeURIComponent(q)}&after=${encodeURIComponent(next)}`}
              >
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
