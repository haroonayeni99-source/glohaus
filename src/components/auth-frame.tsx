import Link from "next/link";
import { Brand } from "./brand";
import { CalendarDays, Heart, Sparkles } from "lucide-react";
export function AuthFrame({
  children,
  title = "A little space.\nA lot of possibility.",
  description = "Your people, your craft, your next chapter. It starts with an account that’s yours.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand inverse />
        <div className="auth-story-copy">
          <p className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="auth-benefits" aria-label="What you can do on glohaus">
          <span>
            <Sparkles size={16} aria-hidden /> Discover your next look
          </span>
          <span>
            <CalendarDays size={16} aria-hidden /> Keep bookings in one place
          </span>
          <span>
            <Heart size={16} aria-hidden /> Save what inspires you
          </span>
        </div>
        <div className="auth-orbit" aria-hidden>
          <span className="auth-orbit-ring" />
          <span className="auth-orbit-dot auth-orbit-dot-one" />
          <span className="auth-orbit-dot auth-orbit-dot-two" />
        </div>
        <span className="eyebrow">BEAUTIFULLY INDEPENDENT.</span>
      </aside>
      <main id="main" className="auth-main">
        <Link className="back-link" href="/">
          ← Back to glohaus
        </Link>
        <div className="auth-body">{children}</div>
        <p className="auth-footer">
          Your personal space for all things beauty.
        </p>
      </main>
    </div>
  );
}
