import Link from "next/link";
import { ArrowUpRight, HeartHandshake, Sparkles, Users } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { publicViewerSignedIn } from "@/lib/public-viewer";

export const metadata = { title: "About GLOHAUS" };

export default async function AboutPage() {
  const signedIn = await publicViewerSignedIn();
  return (
    <>
      <PublicHeader signedIn={signedIn} />
      <main id="main" className="public-info-page">
        <section className="public-info-hero">
          <p className="eyebrow">ABOUT GLOHAUS</p>
          <h1>Beauty, community and independent professionals.</h1>
          <p>
            GLOHAUS is being built as a marketplace where customers can discover
            beauty talent and professionals can build their business in one connected place.
          </p>
        </section>
        <section className="public-info-grid public-info-grid-three">
          <article><Sparkles size={24} /><h2>Discovery first</h2><p>Make it easier to find the right professional by style, service and location—not just by who already has the biggest following.</p></article>
          <article><Users size={24} /><h2>Built for independents</h2><p>Give professionals tools for profiles, bookings, availability, earnings, products and client relationships.</p></article>
          <article><HeartHandshake size={24} /><h2>Clearer marketplace trust</h2><p>Bring verification, reviews, booking records and payment history together so customers and professionals have better context.</p></article>
        </section>
        <section className="public-info-cta">
          <div><p className="eyebrow">GLOHAUS</p><h2>Discover the marketplace.</h2></div>
          <Link className="button" href="/explore">Explore GLOHAUS <ArrowUpRight size={18} /></Link>
        </section>
      </main>
      <BottomNavigation active="home" signedIn={signedIn} />
    </>
  );
}
