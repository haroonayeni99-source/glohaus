import Link from "next/link";
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  PackageCheck,
  ShieldCheck,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";

export const metadata = { title: "Customer account preview" };

const links = [
  ["Upcoming bookings","Your next moment of self-care","/explore",CalendarDays],
  ["Booking history","Past visits, reviews and rebooking","/explore",CalendarDays],
  ["Wallet & payments","Deposits, refunds and payment activity","/shop",WalletCards],
  ["Following","Professionals you want to keep up with","/explore",Users],
  ["Saved looks","All the inspiration you want to keep","/explore",Bookmark],
  ["My reviews","Feedback from your verified appointments","/explore",Star],
  ["Shop orders","Track product purchases and delivery","/shop",PackageCheck],
  ["Notifications","Keep up with your appointments","/explore",Bell],
  ["Account & security","Manage your sign-in and verification","/security",ShieldCheck],
] as const;

export default function CustomerPreviewPage() {
  return (
    <>
      <PublicHeader signedIn />
      <div className="pro-preview-auth-bar">
        <div>
          <strong>GLOHAUS CUSTOMER PREVIEW</strong>
          <span>
            You are signed in. Account data is temporarily unavailable, so this preview lets you continue reviewing the customer experience.
          </span>
        </div>
        <nav aria-label="Customer preview actions">
          <Link href="/explore">Explore</Link>
          <Link className="button" href="/shop">Shop</Link>
        </nav>
      </div>
      <main id="main" className="customer-account-page">
        <section className="customer-identity">
          <span className="customer-avatar" aria-hidden>G</span>
          <p className="eyebrow">YOUR GLOHAUS</p>
          <h1>Customer preview</h1>
          <p>Discover. Book. Get inspired.</p>
        </section>
        <nav className="account-menu" aria-label="Customer preview">
          {links.map(([label, description, href, Icon]) => (
            <Link href={href} key={label}>
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
          <Link className="text-link" href="/explore">
            <Compass size={17} aria-hidden /> Find your next look
          </Link>
        </div>
      </main>
      <BottomNavigation active="profile" signedIn />
    </>
  );
}
