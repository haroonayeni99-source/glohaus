import Link from "next/link";
import { Brand } from "./brand";

const groups = [
  {
    title: "GLOHAUS",
    links: [
      ["About", "/about"],
      ["FAQ", "/faq"],
      ["How it works", "/how-it-works"],
      ["Contact & support", "/contact"],
    ],
  },
  {
    title: "For customers",
    links: [
      ["Find a professional", "/explore"],
      ["Discover", "/discover"],
      ["Shop", "/shop"],
      ["Refunds & cancellations", "/refunds"],
    ],
  },
  {
    title: "For professionals",
    links: [
      ["Join GLOHAUS PRO", "/sign-up?intent=professional&returnTo=/professional/setup"],
      ["Professional preview", "/professional-preview"],
      ["Professional terms", "/professional-terms"],
      ["Marketplace terms", "/marketplace-terms"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms of use", "/terms"],
      ["Privacy policy", "/privacy"],
      ["Refund policy", "/refunds"],
      ["Marketplace terms", "/marketplace-terms"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="glohaus-site-footer">
      <div className="glohaus-site-footer-brand">
        <Brand inverse />
        <p>Beauty, bookings and business in one connected marketplace.</p>
      </div>
      <div className="glohaus-site-footer-links">
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <nav aria-label={group.title}>
              {group.links.map(([label, href]) => (
                <Link key={label} href={href}>{label}</Link>
              ))}
            </nav>
          </section>
        ))}
      </div>
      <div className="glohaus-site-footer-bottom">
        <span>© 2026 GLOHAUS. All rights reserved.</span>
        <span>Independent beauty marketplace</span>
      </div>
    </footer>
  );
}
