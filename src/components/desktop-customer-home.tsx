import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Heart,
  Home,
  MapPin,
  MessageSquare,
  Search,
  ShoppingBag,
  UserRound,
  WalletCards,
  Gift,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./brand";
import { AccountControls } from "./account-controls";
import { HomeStory } from "./home-story";
import { money, type PublicProfessional } from "@/modules/professionals/domain";
import type { CustomerHomeSummary } from "@/modules/home/repository";

const serviceTiles = [
  [
    "Hair",
    "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=240&q=80",
  ],
  [
    "Nails",
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=240&q=80",
  ],
  [
    "Barber",
    "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=240&q=80",
  ],
  [
    "Waxing",
    "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=240&q=80",
  ],
  [
    "Injectables",
    "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=240&q=80",
  ],
] as const;
const trends = [
  [
    "The Hair Edit",
    "Explore textures & styles",
    "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=700&q=85",
  ],
  [
    "Nail Inspiration",
    "Find your next nail look",
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=700&q=85",
  ],
  [
    "Beauty Looks",
    "Makeup inspiration",
    "https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=700&q=85",
  ],
  [
    "Your next beauty space",
    "Explore the directory",
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=700&q=85",
  ],
] as const;

function bookingTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function messagePreview(value: string | null | undefined) {
  if (!value) return "";
  return value.length > 64 ? `${value.slice(0, 61)}…` : value;
}

export function DesktopCustomerHome({
  professionals = [],
  signedIn = false,
  displayName = "",
  canAccessAdmin = false,
  summary = null,
}: {
  professionals?: PublicProfessional[];
  signedIn?: boolean;
  displayName?: string;
  canAccessAdmin?: boolean;
  summary?: CustomerHomeSummary | null;
}) {
  const protectedHref = (path: string) =>
    signedIn ? path : `/sign-in?returnTo=${encodeURIComponent(path)}`;
  const nextBooking = summary?.nextBooking ?? null;
  const messages = summary?.messages ?? null;
  const payments = summary?.payments ?? null;
  const latestMessage = messagePreview(messages?.latestMessageBody);
  const messageInitial =
    messages?.latestProfessionalName?.slice(0, 1).toUpperCase() || "G";

  const cards = professionals.slice(0, 4).map((item) => ({
    id: item.id,
    name: item.business_name,
    role: item.category,
    city: item.city,
    slug: item.slug,
    image: item.photo_id ? `/api/media/${item.photo_id}` : null,
    rating:
      item.rating != null && (item.review_count ?? 0) > 0
        ? Number(item.rating).toFixed(1)
        : null,
  }));
  return (
    <div
      className={`desktop-customer-home ${signedIn ? "is-member" : "is-guest"}`}
    >
      <aside className="customer-desktop-sidebar">
        <Brand />
        <nav aria-label="Customer navigation">
          <Link className="active" href="/">
            <Home size={20} />
            Home
          </Link>
          <Link href="/explore">
            <Search size={20} />
            Explore
          </Link>
          {signedIn && (
            <>
              <Link href={protectedHref("/account/bookings")}>
                <CalendarDays size={20} />
                Bookings
              </Link>
              <Link href={protectedHref("/messages")}>
                <MessageSquare size={20} />
                Messages
              </Link>
            </>
          )}
          <Link href="/discover">
            <Heart size={20} />
            Get inspired
          </Link>
          <Link href="/shop">
            <ShoppingBag size={20} />
            Shop
          </Link>
          {signedIn && (
            <>
              <Link href={protectedHref("/wallet")}>
                <WalletCards size={20} />
                Wallet
              </Link>
              <Link href={protectedHref("/workspace")}>
                <UserRound size={20} />
                Profile
              </Link>
            </>
          )}
          {!signedIn && (
            <>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/sign-up?intent=professional">For professionals</Link>
            </>
          )}
          {canAccessAdmin && (
            <Link href="/admin">
              <ShieldCheck size={20} />
              Owner/Admin
            </Link>
          )}
        </nav>
        <p className="home-sidebar-note">
          LOOK GOOD
          <br />
          FEEL GOOD
          <br />
          BELONG
        </p>
      </aside>

      <main className="customer-desktop-main">
        <header className="customer-desktop-topbar">
          <span className="home-topline">Beauty. Community. Bookings.</span>
          <div>
            {signedIn ? (
              <>
                <Link className="desktop-user-chip" href="/workspace">
                  <span className="desktop-avatar">
                    {displayName[0]?.toUpperCase() || "G"}
                  </span>
                  {displayName || "My account"}
                </Link>
                <AccountControls />
              </>
            ) : (
              <>
                <Link href="/sign-in">Sign in</Link>
                <Link className="home-join" href="/sign-up">
                  Join GLOHAUS
                </Link>
              </>
            )}
            {canAccessAdmin && (
              <Link href="/admin" aria-label="Owner/Admin">
                <ShieldCheck size={20} />
              </Link>
            )}
          </div>
        </header>

        <section className="desktop-hero" style={{ position: "relative" }}>
          <div className="desktop-hero-copy">
            <p className="eyebrow">DISCOVER. BOOK. GET INSPIRED.</p>
            <h1>
              Beauty that
              <br />
              feels like you.
            </h1>
            <p>
              Find and book beauty professionals near you.
              <br />A new look. A familiar favourite. Your next inspiration.
            </p>
            <form action="/explore" className="desktop-hero-search">
              <Search size={20} />
              <input
                name="q"
                aria-label="Search beauty"
                placeholder="Find hair, nails, beauty & more"
              />
              <button>Search</button>
            </form>
            <p className="home-browse-note">
              Explore freely. Create an account when you’re ready to book.
            </p>
          </div>
          <Image
            fill
            priority
            sizes="60vw"
            src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1600&q=88"
            alt="Beauty inspiration portrait"
          />
        </section>

        <nav className="desktop-service-row" aria-label="Beauty services">
          {serviceTiles.map(([label, img]) => (
            <Link href={"/explore?q=" + encodeURIComponent(label)} key={label}>
              <span>
                <Image fill sizes="100px" src={img} alt="" />
              </span>
              <strong>{label}</strong>
            </Link>
          ))}
          <Link href="/explore">
            <span className="desktop-view-all">
              <ChevronRight />
            </span>
            <strong>View all</strong>
          </Link>
        </nav>

        {cards.length > 0 && (
          <section className="desktop-section">
            <div className="desktop-section-title">
              <h2>Meet the professionals</h2>
              <Link href="/explore">
                See all <ChevronRight size={15} />
              </Link>
            </div>
            <div className="desktop-pro-grid">
              {cards.map((card) => (
                <article className="desktop-pro-card" key={card.id}>
                  <Link
                    href={card.slug ? `/p/${card.slug}` : "/explore"}
                    className="desktop-pro-photo"
                  >
                    {card.image ? (
                      <Image
                        fill
                        sizes="260px"
                        src={card.image}
                        alt={card.name}
                        unoptimized
                      />
                    ) : (
                      <span className="home-pro-initial">
                        {card.name.slice(0, 1)}
                      </span>
                    )}
                    {card.rating && (
                      <span className="desktop-rating">★ {card.rating}</span>
                    )}
                  </Link>
                  <div>
                    <strong>{card.name}</strong>
                    <span>{card.role}</span>
                    <small>
                      <MapPin size={13} />
                      {card.city}
                    </small>
                    <Link
                      className="desktop-book"
                      href={card.slug ? `/p/${card.slug}` : "/explore"}
                    >
                      View profile
                    </Link>
                  </div>
                </article>
              ))}{" "}
            </div>
          </section>
        )}

        <section className="desktop-section desktop-trending">
          <div className="desktop-section-title">
            <h2>A little inspiration</h2>
            <Link href="/explore">
              See all <ChevronRight size={15} />
            </Link>
          </div>
          <div className="desktop-trend-grid">
            {trends.map(([title, sub, img]) => (
              <Link href="/explore" key={title}>
                <Image fill sizes="300px" src={img} alt="" />
                <span>
                  <strong>{title}</strong>
                  <small>{sub}</small>
                </span>
                <i>
                  <ChevronRight size={18} />
                </i>
              </Link>
            ))}
          </div>
        </section>
        <HomeStory />
      </main>

      {signedIn && (
        <aside className="customer-desktop-rail">
          <section>
            <div className="rail-heading">
              <h2>Upcoming Booking</h2>
              <Link href={protectedHref("/account/bookings")}>View all →</Link>
            </div>
            <div className="rail-empty-booking">
              <CalendarDays size={25} />
              <div>
                <strong>
                  {!signedIn
                    ? "Ready when you are"
                    : !summary
                      ? "Booking summary unavailable"
                      : nextBooking
                        ? nextBooking.serviceName
                        : "No upcoming bookings"}
                </strong>
                <span>
                  {!signedIn
                    ? "Sign in to see your bookings."
                    : !summary
                      ? "Open bookings to check your schedule."
                      : nextBooking
                        ? `${nextBooking.professionalName} · ${bookingTime(nextBooking.startsAt)}`
                        : "Find a professional whenever you’re ready."}
                </span>
              </div>
            </div>
            <Link
              className="rail-soft-button"
              href={
                !signedIn
                  ? protectedHref("/account/bookings")
                  : nextBooking
                    ? `/account/bookings/${nextBooking.id}`
                    : "/explore"
              }
            >
              {!signedIn
                ? "Sign in"
                : nextBooking
                  ? "View booking"
                  : "Find a professional"}
              <ChevronRight size={16} />
            </Link>
          </section>
          <section>
            <div className="rail-heading">
              <h2>Messages</h2>
              <Link href={protectedHref("/messages")}>Open →</Link>
            </div>
            <div className="rail-message">
              <span className="desktop-avatar">{messageInitial}</span>
              <div>
                <strong>
                  {!signedIn
                    ? "Private conversations"
                    : !summary
                      ? "Message summary unavailable"
                      : messages?.conversationCount
                        ? messages.unreadCount
                          ? `${messages.unreadCount} unread message${messages.unreadCount === 1 ? "" : "s"}`
                          : "Messages up to date"
                        : "No conversations yet"}
                </strong>
                <small>
                  {!signedIn
                    ? "Message professionals and keep booking conversations together."
                    : !summary
                      ? "Open Messages to check your conversations."
                      : messages?.latestProfessionalName
                        ? `${messages.latestProfessionalName}${latestMessage ? ` · ${latestMessage}` : ""}`
                        : "Message a professional from their profile to start a conversation."}
                </small>
              </div>
            </div>
            <Link
              className="rail-soft-button"
              href={protectedHref("/messages")}
            >
              Open messages
              <ChevronRight size={16} />
            </Link>
          </section>
          <section>
            <div className="rail-heading">
              <h2>Wallet & Rewards</h2>
              <Link href={protectedHref("/wallet")}>Payments →</Link>
            </div>
            <Link className="rail-wallet" href={protectedHref("/wallet")}>
              <WalletCards />
              <div>
                {!signedIn ? (
                  <>
                    <small>Wallet</small>
                    <strong>Payments & refunds</strong>
                  </>
                ) : payments ? (
                  <>
                    <small>Deposits paid</small>
                    <strong>{money(payments.capturedPence)}</strong>
                    <small>
                      {payments.pendingRefundPence > 0
                        ? `${money(payments.pendingRefundPence)} refund processing`
                        : payments.refundedPence > 0
                          ? `${money(payments.refundedPence)} refunded`
                          : "No refunds recorded"}
                    </small>
                  </>
                ) : (
                  <>
                    <small>Wallet</small>
                    <strong>Payment summary unavailable</strong>
                  </>
                )}
              </div>
              <ChevronRight size={16} />
            </Link>
            <div className="rail-reward rail-reward-disabled">
              <Gift />
              <span>
                <strong>GloHaus Rewards</strong>
                <small>
                  Rewards remain unavailable until customer-credit programme
                  rules are approved.
                </small>
              </span>
            </div>
          </section>
          <Link className="desktop-shop-banner" href="/shop">
            <div>
              <strong>
                Shop Beauty
                <br />
                Essentials
              </strong>
              <span>Curated products from trusted professionals.</span>
              <b>Shop Now →</b>
            </div>
            <Image
              fill
              sizes="320px"
              src="https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=800&q=85"
              alt="Beauty products"
            />
          </Link>
        </aside>
      )}
    </div>
  );
}
