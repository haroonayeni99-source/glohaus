import Image from "next/image";
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
  ["Upcoming bookings","Your next moment of self-care","bookings",CalendarDays,"https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=240&q=82"],
  ["Booking history","Past visits, reviews and rebooking","history",CalendarDays,"https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=240&q=82"],
  ["Wallet & payments","Deposits, refunds and payment activity","wallet",WalletCards,"https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=240&q=82"],
  ["Following","Professionals you want to keep up with","following",Users,"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=82"],
  ["Saved looks","All the inspiration you want to keep","saved",Bookmark,"https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=240&q=82"],
  ["My reviews","Feedback from your verified appointments","reviews",Star,"https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=240&q=82"],
  ["Shop orders","Track product purchases and delivery","orders",PackageCheck,"https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=240&q=82"],
  ["Notifications","Keep up with your appointments","notifications",Bell,"https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=240&q=82"],
  ["Account & security","Manage your sign-in and verification","security",ShieldCheck,"https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=240&q=82"],
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
            {links.map(([label, description, key, Icon, thumbnail]) => (
              <Link href={"/customer-preview?view="+key} key={key}>
                <span className="customer-menu-thumb">
                  <Image fill sizes="72px" src={thumbnail} alt="" />
                  <span className="customer-menu-icon"><Icon size={15} aria-hidden /></span>
                </span>
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
