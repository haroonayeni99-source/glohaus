import Image from "next/image";
import { withIdentity } from "@/lib/db";
import { customerProfile } from "@/modules/accounts/customer-profile";
import Link from "next/link";
import {
  UserRound,
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  ShieldCheck,
  Star,
  Store,
  PackageCheck,
  Users,
  WalletCards,
  Megaphone,
  ThumbsUp,
  Smartphone,
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
  ["Your profile", "Your name and photo", "/account/profile", UserRound],
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
    "Wallet & payments",
    "Deposits, refunds and payment activity",
    "/wallet",
    WalletCards,
  ],
  [
    "Following",
    "Professionals you want to keep up with",
    "/account/following",
    Users,
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
  [
    "Shop orders",
    "Track product purchases and delivery",
    "/account/orders",
    PackageCheck,
  ],
  ["Invite friends", "Share GLOHAUS with someone", "/account/invite", Users],
  ["Notifications", "Keep up with your appointments", "/notifications", Bell],
  ["Phone notification settings", "Choose alerts, enable devices and send a test", "/account/notifications", Bell],
  ["Install GLOHAUS", "Add GLOHAUS to your Home Screen", "/install", Smartphone],
  ["Marketing preferences", "Choose the optional GLOHAUS emails you want", "/preferences", Megaphone],
  ["Feature votes", "Privately vote on what GLOHAUS should build next", "/feature-votes", ThumbsUp],
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
  const profile = await withIdentity(account.authId, db => customerProfile(db, account.id));
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" className="customer-account-page">
        <section className="customer-identity">
          <span className="customer-avatar" aria-hidden>
            {profile?.has_photo ? <Image src={`/api/v1/customer-photos/${account.id}`} width={80} height={80} alt="" unoptimized className="customer-profile-portrait"/> : account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <p className="eyebrow">YOUR GLOHAUS</p>
          <h1>{account.displayName}</h1>
          <p>Discover. Book. Get inspired.</p>
        </section>
        {!profile?.first_name && <p className="form-notice"><Link href="/account/profile">Add your name and an optional photo</Link> so your professional can recognise you.</p>}
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
      <BottomNavigation active="profile" signedIn />
    </>
  );
}
