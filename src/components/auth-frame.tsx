import Link from "next/link";
import { Brand } from "./brand";
import { ArrowUpRight, CalendarDays, Heart, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

type AuthAudience = "customer" | "professional";

const stories = {
  customer: {
    strapline: "LOOK GOOD • FEEL GOOD • BELONG",
    eyebrow: "BEAUTY, COMMUNITY, BOOKINGS",
    title: "Discover.\nBook.\nGet Inspired.",
    description: "Find and book beauty professionals near you.",
    benefits: [
      { icon: Sparkles, text: "Explore local beauty talent" },
      { icon: CalendarDays, text: "Book in seconds" },
      { icon: Heart, text: "Save your favourites" },
    ],
    footer: "Beauty. Community. Belonging.",
  },
  professional: {
    strapline: "WORK • GROW • BELONG",
    eyebrow: "GLOHAUS PRO",
    title: "Grow Your\nBeauty Business",
    description:
      "Join Glohaus and turn your profile into your digital beauty storefront. Showcase your work, build your audience and manage your bookings in one place.",
    benefits: [
      { icon: CalendarDays, text: "Manage bookings with ease" },
      { icon: TrendingUp, text: "Grow your client base" },
      { icon: ShieldCheck, text: "Build a trusted business" },
    ],
    footer: "More beauty. More community.",
  },
} as const;

export function AuthFrame({
  children,
  audience = "customer",
}: {
  children: React.ReactNode;
  audience?: AuthAudience;
}) {
  const story = stories[audience];
  return (
    <div className={`auth-layout auth-layout-${audience}`}>
      <aside className="auth-story">
        <div className="auth-brand-lockup">
          <Brand inverse={audience === "customer"} pro={audience === "professional"} />
          <span>{story.strapline}</span>
        </div>
        <div className="auth-story-copy">
          <p className="eyebrow">{story.eyebrow}</p>
          <h2>{story.title}</h2>
          <p>{story.description}</p>
        </div>
        <div className="auth-benefits" aria-label={`What you can do with ${audience === "professional" ? "GLOHAUS PRO" : "GLOHAUS"}`}>
          {story.benefits.map(({ icon: Icon, text }) => (
            <span key={text}>
              <Icon size={16} aria-hidden /> {text}
            </span>
          ))}
        </div>
        <div className="auth-visual" aria-hidden>
          <span className="auth-visual-card auth-visual-card-one" />
          <span className="auth-visual-card auth-visual-card-two" />
          <span className="auth-visual-card auth-visual-card-three" />
        </div>
        <div className="auth-orbit" aria-hidden>
          <span className="auth-orbit-ring" />
          <span className="auth-orbit-dot auth-orbit-dot-one" />
          <span className="auth-orbit-dot auth-orbit-dot-two" />
        </div>
        <span className="eyebrow auth-story-footer">{story.footer}</span>
      </aside>
      <main id="main" className="auth-main">
        <Link className="back-link" href="/">
          ← Back to GLOHAUS
        </Link>
        {audience === "professional" && (
          <Link className="auth-preview-link" href="/professional-preview">
            See a GLOHAUS PRO page preview <ArrowUpRight size={15} aria-hidden />
          </Link>
        )}
        <div className="auth-body">{children}</div>
        <p className="auth-footer">
          {audience === "professional"
            ? "GLOHAUS PRO · WORK • GROW • BELONG"
            : "GLOHAUS · LOOK GOOD • FEEL GOOD • BELONG"}
        </p>
      </main>
    </div>
  );
}
