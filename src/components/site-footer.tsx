"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Brand } from "./brand";

export function SiteFooter() {
  const pathname = usePathname();
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/professional") ||
    pathname === "/discover" ||
    pathname === "/messages"
  )
    return null;
  return (
    <footer className="glohaus-site-footer" aria-label="Website footer">
      <div className="site-footer-brand">
        <Brand />
        <p>LOOK GOOD • FEEL GOOD • BELONG</p>
        <p>
          Beauty. Community. Bookings.
          <br />
          All in one place.
        </p>
      </div>
      <nav aria-label="Explore GLOHAUS">
        <h2>Explore</h2>
        <Link href="/discover">Get inspired</Link>
        <Link href="/explore">Find professionals</Link>
        <Link href="/shop">Shop beauty</Link>
        <Link href="/about">About GLOHAUS</Link>
      </nav>
      <nav aria-label="Help and professionals">
        <h2>Get started</h2>
        <Link href="/how-it-works">How it works</Link>
        <Link href="/faq">Help & FAQs</Link>
        <Link href="/sign-up?intent=professional">Join GLOHAUS PRO</Link>
        <Link href="/professional-terms">Professional guidelines</Link>
      </nav>
      <nav aria-label="Legal policies">
        <h2>The details</h2>
        <Link href="/terms">Terms & conditions</Link>
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/refunds">Cancellations & refunds</Link>
        <Link href="/marketplace-terms">Marketplace terms</Link>
      </nav>
      <div className="site-footer-bottom">
        <span>© GLOHAUS</span>
        <span>More than beauty. A community.</span>
      </div>
    </footer>
  );
}
