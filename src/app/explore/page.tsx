import Link from "next/link";
import { ProfessionalCard } from "@/components/professional-card";
import { Search, ArrowUpRight, Sparkles } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { withIdentity } from "@/lib/db";
import { discoveryOptions } from "@/modules/professionals/discovery";
import { discoveryPage } from "@/modules/professionals/repository";
import type { PublicProfessional } from "@/modules/professionals/domain";
export const dynamic = "force-dynamic";
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string }>;
}) {
  const { query: q, after } = discoveryOptions(await searchParams);
  let next: string | null = null;
  let professionals: PublicProfessional[] = [];
  let unavailable = !process.env.DATABASE_URL;
  if (!unavailable)
    try {
      const page = await withIdentity("", (db) => discoveryPage(db, q, after));
      professionals = page.professionals;
      next = page.next;
    } catch {
      unavailable = true;
    }
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <p className="eyebrow">INDEPENDENT TALENT. YOUR KIND OF BEAUTY.</p>
        <h1>
          Find your <em>people.</em>
        </h1>
        <p className="lead">
          Explore professionals, discover their craft, and find your next
          appointment.
        </p>
        <form className="catalog-search" role="search">
          <Search size={21} />
          <label className="sr-only" htmlFor="search">
            Search by service, category, business or city
          </label>
          <input
            id="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Try nails, a business name, or London"
          />
          <button className="button small">Search</button>
        </form>
        {professionals.length ? (
          <div className="professional-grid">
            {professionals.map((pro) => (
              <ProfessionalCard key={pro.id} professional={pro} />
            ))}
          </div>
        ) : (
          <section className="catalog-empty">
            <Sparkles size={32} />
            <h2>
              {unavailable
                ? "Our community is taking shape."
                : "No professionals found just yet."}
            </h2>
            <p>
              {unavailable
                ? "Professional discovery opens once our live directory is connected. You can still explore the glohaus inspiration feed."
                : "Try another city or category, or come back as more independent professionals join."}
            </p>
            <Link className="text-link" href="/">
              Back to inspiration
              <ArrowUpRight size={17} />
            </Link>
          </section>
        )}
        <nav
          className="booking-pagination"
          aria-label="Professional search pages"
        >
          {after && (
            <Link
              className="text-link"
              href={`/explore?q=${encodeURIComponent(q)}`}
            >
              ← Back to first results
            </Link>
          )}
          {next && (
            <Link
              className="button small"
              href={`/explore?q=${encodeURIComponent(q)}&after=${encodeURIComponent(next)}`}
            >
              More professionals →
            </Link>
          )}
        </nav>
      </main>
    </>
  );
}
