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
      <p className="glohaus-header-tagline">
        {professional ? "WORK • GROW • BELONG" : "LOOK GOOD • FEEL GOOD • BELONG"}
      </p>
      <nav aria-label="Main navigation">
        <Link className="glohaus-search-link" href="/explore">
          <Search size={17} aria-hidden />
          <span>Search beauty</span>
        </Link>
        <Link
          className="glohaus-notification-link"
          href={notificationHref}
          aria-label="Your GLOHAUS notifications"
        >
          <Bell size={19} aria-hidden />
        </Link>
        <Link className="glohaus-policy-link" href="/terms">
          Terms
        </Link>
        <Link className="glohaus-sign-in" href={accountHref}>
          {accountLabel}
        </Link>
      </nav>
    </header>
  );
}
