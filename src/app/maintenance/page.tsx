import Link from "next/link";
import { Wrench } from "lucide-react";

export const metadata = {
  title: "Temporarily unavailable",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main id="main" className="maintenance-page">
      <section className="maintenance-card">
        <span className="maintenance-icon"><Wrench size={26} aria-hidden /></span>
        <p className="eyebrow">GLOHAUS</p>
        <h1>We&apos;re making a few improvements.</h1>
        <p>
          GLOHAUS is temporarily unavailable to the public. Please check back soon.
        </p>
        <Link href="/sign-in" className="text-link">Owner / staff sign in</Link>
      </section>
    </main>
  );
}
