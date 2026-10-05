import Link from "next/link";
import { Brand } from "./brand";

const groups = [
  {
    title: "GLOHAUS",
    links: [
      ["About", "/about"],
      ["FAQ", "/faq"],
      ["How it works", "/how-it-works"],
    ],
  },
  {
    title: "For customers",
    links: [
      ["Find a beauty professional", "/explore"],
      ["Discover", "/discover"],
      ["Shop", "/shop"],
      ["Refunds & cancellations", "/refunds"],
    ],
  },
  {
    title: "For beauty professionals",
    links: [
      ["Join GLOHAUS PRO", "/sign-up?intent=professional&returnTo=/professional/setup"],
      ["Beauty professional preview", "/professional-preview"],
      ["Professional terms", "/professional-terms"],
      ["Marketplace terms", "/marketplace-terms"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms & conditions", "/terms"],
      ["Privacy policy", "/privacy"],
      ["Refunds & cancellations", "/refunds"],
      ["Professional terms", "/professional-terms"],
      ["Marketplace terms", "/marketplace-terms"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="glohaus-site-footer">
      <div className="glohaus-site-footer-brand">
        <Brand inverse />
        <p>Look good. Feel good. Stand out.</p>
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
        <span>Beauty professionals, bookings and marketplace</span>
      </div>
    </footer>
  );
}
