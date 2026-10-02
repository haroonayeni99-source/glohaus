import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Brand } from "./brand";

/** Shared public header for customer, profile and professional pages. */
export function GlohausHeader({
  professional = false,
  signedIn = false,
}: {
  professional?: boolean;
  signedIn?: boolean;
}) {
  const notificationHref = signedIn
    ? "/notifications"
    : "/sign-in?returnTo=%2Fnotifications";
  const accountHref = signedIn
    ? "/account"
    : professional
      ? "/sign-in?intent=professional&returnTo=/professional"
      : "/sign-in";
  const accountLabel = signedIn
    ? "My account"
    : professional
      ? "Professional sign in"
      : "Sign in";

  return (
    <header className="glohaus-header">
      <Brand pro={professional} inverse />
      {!professional ? (
        <nav className="glohaus-main-links" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/explore">Find a Professional</Link>
          <Link href="/discover">Discover</Link>
          <Link href="/share">Share</Link>
          <Link href="/how-it-works">How It Works</Link>
          <Link href="/professional-preview">For Professionals</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
      ) : (
        <p className="glohaus-header-tagline">WORK • GROW • BELONG</p>
      )}
      <nav className="glohaus-header-actions" aria-label="Account navigation">
        <Link className="glohaus-search-link" href="/explore" aria-label="Search beauty">
          <Search size={17} aria-hidden />
          <span>Search</span>
        </Link>
        <Link
          className="glohaus-notification-link"
          href={notificationHref}
          aria-label="Your GLOHAUS notifications"
        >
          <Bell size={19} aria-hidden />
        </Link>
        <Link className="glohaus-sign-in" href={accountHref}>
          {accountLabel}
        </Link>
        {!signedIn && !professional && (
          <Link className="glohaus-sign-up" href="/sign-up">
            Sign up
          </Link>
        )}
      </nav>
    </header>
  );
}
