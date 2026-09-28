import Link from "next/link";
import {
  Bell, Bookmark, CalendarDays, ChevronRight, Compass, PackageCheck,
  ShieldCheck, Star, Users, WalletCards
} from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";

export const metadata = { title: "Customer account preview" };

const views = {
  bookings: ["Upcoming bookings","Your next appointment appears here once a booking is confirmed."],
  history: ["Booking history","Completed and cancelled appointments will appear here, with rebook and review actions."],
  wallet: ["Wallet & payments","Deposits, refunds and payment activity will be shown here."],
  following: ["Following","Professionals you follow will appear here so you can quickly return to their profiles."],
  saved: ["Saved looks","Saved posts, looks and inspiration will appear here."],
  reviews: ["My reviews","Your verified appointment reviews will appear here."],
  orders: ["Shop orders","Product purchases, shipping and delivery progress will appear here."],
  notifications: ["Notifications","Booking reminders, messages, order updates and account alerts will appear here."],
  security: ["Account & security","Password, MFA and account-security controls live here."],
} as const;

const links = [
  ["Upcoming bookings","Your next moment of self-care","bookings",CalendarDays],
  ["Booking history","Past visits, reviews and rebooking","history",CalendarDays],
  ["Wallet & payments","Deposits, refunds and payment activity","wallet",WalletCards],
  ["Following","Professionals you want to keep up with","following",Users],
  ["Saved looks","All the inspiration you want to keep","saved",Bookmark],
  ["My reviews","Feedback from your verified appointments","reviews",Star],
  ["Shop orders","Track product purchases and delivery","orders",PackageCheck],
  ["Notifications","Keep up with your appointments","notifications",Bell],
  ["Account & security","Manage your sign-in and verification","security",ShieldCheck],
] as const;

export default async function CustomerPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const selected = view && view in views ? views[view as keyof typeof views] : null;

  return (
    <>
      <PublicHeader signedIn />
      <div className="pro-preview-auth-bar">
        <div>
          <strong>GLOHAUS CUSTOMER DEMO</strong>
          <span>Authenticated preview mode — use the menu below to inspect the customer experience while live account data is unavailable.</span>
        </div>
        <nav aria-label="Customer preview actions">
          <Link href="/customer-preview">Dashboard</Link>
          <Link href="/explore">Explore</Link>
          <Link className="button" href="/shop">Shop</Link>
        </nav>
      </div>
      <main id="main" className="customer-account-page">
        <section className="customer-identity">
          <span className="customer-avatar" aria-hidden>G</span>
          <p className="eyebrow">YOUR GLOHAUS</p>
          <h1>{selected?.[0] ?? "Customer dashboard"}</h1>
          <p>{selected?.[1] ?? "Discover. Book. Get inspired."}</p>
        </section>

        {selected ? (
          <section className="pro-panel">
            <p className="eyebrow">DEMO VIEW</p>
            <h2>{selected[0]}</h2>
            <p>{selected[1]}</p>
            <div className="account-switch">
              <Link className="button" href="/customer-preview">Back to account</Link>
              {view === "bookings" && <Link className="text-link" href="/explore">Find a professional</Link>}
              {view === "orders" && <Link className="text-link" href="/shop">Browse products</Link>}
              {view === "security" && <Link className="text-link" href="/security">Open security</Link>}
            </div>
          </section>
        ) : (
          <nav className="account-menu" aria-label="Customer preview">
            {links.map(([label, description, key, Icon]) => (
              <Link href={"/customer-preview?view="+key} key={key}>
                <Icon size={21} aria-hidden />
                <span><strong>{label}</strong><small>{description}</small></span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            ))}
          </nav>
        )}

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
