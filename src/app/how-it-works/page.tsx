import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Search, ShieldCheck, WalletCards } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const metadata = { title: "How GLOHAUS Works" };

export default async function HowItWorksPage() {
  const signedIn = await publicViewerSignedIn();
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <main id="main" className="public-info-page">
        <section className="public-info-hero">
          <p className="eyebrow">HOW GLOHAUS WORKS</p>
          <h1>Find your beauty professional. Book with clarity.</h1>
          <p>
            GLOHAUS brings beauty discovery, bookings, payments and professional
            profiles into one place.
          </p>
        </section>
        <section className="public-info-grid">
          <article><Search size={24} /><span>01</span><h2>Discover</h2><p>Search by service, beauty professional, area, borough or street and explore real beauty professional profiles.</p></article>
          <article><CalendarCheck size={24} /><span>02</span><h2>Book</h2><p>Choose a service and available time, then review the full customer price before confirming.</p></article>
          <article><ShieldCheck size={24} /><span>03</span><h2>Stay protected</h2><p>Booking records, verification status, reviews and payment records help keep activity connected to GLOHAUS.</p></article>
          <article><WalletCards size={24} /><span>04</span><h2>Beauty professionals get paid</h2><p>Beauty professional proceeds follow GLOHAUS release rules before becoming available to withdraw.</p></article>
        </section>
        <section className="public-info-cta">
          <div><p className="eyebrow">READY TO EXPLORE?</p><h2>Find beauty professionals across London.</h2></div>
          <Link className="button" href="/explore">Find a Beauty Professional <ArrowUpRight size={18} /></Link>
        </section>
      </main>
      <BottomNavigation active="search" signedIn={signedIn} />
    </>
  );
}
