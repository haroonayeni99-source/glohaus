import Link from "next/link";
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  ShieldCheck,
  Star,
  Store,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AccountControls } from "@/components/account-controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };
const links = [
  [
    "Upcoming bookings",
    "Your next moment of self-care",
    "/account/bookings",
    CalendarDays,
  ],
  [
    "Booking history",
    "Past visits, reviews and rebooking",
    "/account/bookings?view=history",
    CalendarDays,
  ],
  [
    "Saved looks",
    "All the inspiration you want to keep",
    "/account/saved",
    Bookmark,
  ],
  [
    "My reviews",
    "Feedback from your verified appointments",
    "/account/reviews",
    Star,
  ],
  ["Notifications", "Keep up with your appointments", "/notifications", Bell],
  [
    "Account & security",
    "Manage your sign-in and verification",
    "/security",
    ShieldCheck,
  ],
] as const;
export default async function Page() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <AuthFrame>
        <AccessMessage code={result.error} />
      </AuthFrame>
    );
  const account = result.account;
  return (
    <>
      <PublicHeader />
      <main id="main" className="customer-account-page">
        <section className="customer-identity">
          <span className="customer-avatar" aria-hidden>
            {account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <p className="eyebrow">YOUR GLOHAUS</p>
          <h1>{account.displayName}</h1>
          <p>Discover. Book. Get inspired.</p>
        </section>
        <nav className="account-menu" aria-label="Your account">
          {links.map(([label, description, href, Icon]) => (
            <Link href={href} key={href}>
              <Icon size={21} aria-hidden />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          ))}
        </nav>
        <div className="account-switch">
          {account.roles.includes("professional") && (
            <Link className="button" href="/professional">
              <Store size={17} aria-hidden /> Your professional dashboard
            </Link>
          )}
          <Link className="text-link" href="/explore">
            <Compass size={17} aria-hidden /> Find your next look
          </Link>
          <AccountControls />
        </div>
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
