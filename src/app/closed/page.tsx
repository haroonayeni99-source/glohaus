import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata = {
  title: "Temporarily unavailable",
  robots: { index: false, follow: false },
};

export default function ClosedPage() {
  return (
    <main id="main" className="site-closed-page">
      <section className="site-closed-card">
        <Brand />
        <span className="site-closed-icon"><LockKeyhole size={28} aria-hidden /></span>
        <p className="eyebrow">GLOHAUS</p>
        <h1>We&apos;re making a few improvements.</h1>
        <p>
          GLOHAUS is temporarily closed to public visitors. Please check back soon.
        </p>
        <div className="site-closed-actions">
          <Link href="/sign-in">Account sign in</Link>
          <Link href="/admin"><ShieldCheck size={16} aria-hidden /> Owner/Admin</Link>
        </div>
      </section>
    </main>
  );
}
