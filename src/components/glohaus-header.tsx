import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Brand } from "./brand";

/** Shared public header for customer, profile and professional pages. */
export function GlohausHeader({
  professional = false,
}: {
  professional?: boolean;
}) {
  return (
    <header className="glohaus-header">
      <Brand pro={professional} inverse />
      <p className="glohaus-header-tagline">
        {professional ? "WORK • GROW • BELONG" : "LOOK GOOD • FEEL GOOD • BELONG"}
      </p>
      <nav aria-label="Main navigation">
        <Link className="glohaus-search-link" href="/explore">
          <Search size={17} aria-hidden />
          <span>Search beauty</span>
        </Link>
        <Link className="glohaus-notification-link" href="/notifications" aria-label="Your GLOHAUS notifications">
          <Bell size={19} aria-hidden />
        </Link>
        <Link className="glohaus-policy-link" href="/terms">
          Terms
        </Link>
        <Link
          className="glohaus-sign-in"
          href={professional ? "/sign-in?intent=professional&returnTo=/professional" : "/sign-in"}
        >
          {professional ? "Professional sign in" : "Sign in"}
        </Link>
      </nav>
    </header>
  );
}
