import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export function PolicyPage({
  title,
  summary,
  updated = "26 September 2026",
  children,
}: {
  title: string;
  summary: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main id="main" className="policy-page">
        <header className="policy-hero">
          <p className="pro-kicker">GLOHAUS POLICY</p>
          <h1>{title}</h1>
          <p className="lead">{summary}</p>
          <p className="policy-updated">Draft for legal review · Updated {updated}</p>
        </header>

        <div className="policy-content">{children}</div>

        <nav className="policy-links" aria-label="GLOHAUS policies">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Refunds & cancellations</Link>
          <Link href="/professional-terms">Professional terms</Link>
          <Link href="/marketplace-terms">Marketplace terms</Link>
        </nav>
      </main>
    </div>
  );
}
