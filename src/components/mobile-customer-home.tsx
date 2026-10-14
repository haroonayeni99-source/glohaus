import { homepageCategories, categoryImage, categoryName, type HomepageMedia } from "@/modules/platform/homepage-images";
import { HomeMarketplaceGuide } from "./home-marketplace-guide";
import Image from "next/image";
import Link from "next/link";
import { Bell, Search, ShieldCheck } from "lucide-react";
import { HomeStory } from "./home-story";
import { AccountControls } from "./account-controls";
import { Brand } from "./brand";
import { MobileSiteMenu } from "./mobile-site-menu";
import { ProfessionalCard } from "./professional-card";
import { money, type PublicProfessional } from "@/modules/professionals/domain";
import type { CustomerHomeSummary } from "@/modules/home/repository";
import { BottomNavigation } from "./bottom-navigation";

const mobileCategories = homepageCategories.mobile;

export function MobileCustomerHome({
  signedIn = false,
  professionals = [],
  summary = null,
  canAccessAdmin = false,
  homepageMedia = { desktopHero: null, mobileHero: null },
}: {
  signedIn?: boolean;
  professionals?: PublicProfessional[];
  summary?: CustomerHomeSummary | null;
  canAccessAdmin?: boolean;
  homepageMedia?: HomepageMedia;
}) {
  const notificationHref = signedIn
    ? "/notifications"
    : "/sign-in?returnTo=%2Fnotifications";

  return (
    <div className="mobile-customer-home">
      <main id="main" className="mobile-home-main">
        <header className="mobile-home-header">
          <div className="mobile-home-brand">
            <Brand inverse />
            <span>Look good. Feel good. Stand out.</span>
          </div>
          <div className="mobile-home-header-actions">
            {canAccessAdmin && (
              <Link
                className="mobile-home-bell"
                href="/admin"
                aria-label="Owner/Admin"
                title="Owner/Admin"
              >
                <ShieldCheck size={20} aria-hidden />
              </Link>
            )}
            {signedIn ? (
              <>
                <AccountControls />
                <Link
                  className="mobile-home-bell"
                  href={notificationHref}
                  aria-label="Notifications"
                >
                  <Bell size={21} aria-hidden />
                </Link>
              </>
            ) : (
              <Link className="home-mobile-signin" href="/sign-in">
                Sign in
              </Link>
            )}
            <MobileSiteMenu
              signedIn={signedIn}
              canAccessAdmin={canAccessAdmin}
            />
          </div>
        </header>

        <form className="mobile-home-search" action="/explore" role="search">
          <Search size={18} aria-hidden />
          <label className="sr-only" htmlFor="mobile-home-query">
            Search services or professionals
          </label>
          <input
            id="mobile-home-query"
            name="q"
            placeholder="Search services, professionals..."
          />
        </form>

        <nav className="mobile-home-categories" aria-label="Beauty categories">
          {mobileCategories.map((slot) => (
            <Link href={`/explore?q=${encodeURIComponent(categoryName(homepageMedia.categoryNames, "mobile", slot))}`} key={slot.key}>
              <span>
                <Image fill sizes="64px" src={categoryImage(homepageMedia.categoryImages, "mobile", slot)}
                  unoptimized={Boolean(homepageMedia.categoryImages?.mobile?.[slot.key])} alt="" />
              </span>
              <strong>{categoryName(homepageMedia.categoryNames, "mobile", slot)}</strong>
            </Link>
          ))}
        </nav>
        <nav
          className="mobile-home-more-services"
          aria-label="More beauty services"
        >
          {["Barber", "Waxing", "Injectables"].map((label) => (
            <Link key={label} href={`/explore?q=${encodeURIComponent(label)}`}>
              {label}
            </Link>
          ))}
          <Link href="/explore">View all services</Link>
        </nav>

        <section className="mobile-home-hero">
          <Image
            fill
            priority
            sizes="(max-width: 760px) calc(100vw - 28px), 100vw"
            src={
              homepageMedia.mobileHero ||
              "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1100&q=90"
            }
            unoptimized
            alt="Beauty inspiration portrait"
          />
          <div className="mobile-home-hero-shade" />
          <div className="mobile-home-hero-copy">
            <h1>
              Find beauty professionals
              <br />
              near you.
            </h1>
            <p>Find and book beauty professionals near you.</p>
            <Link className="mobile-home-glow" href="/explore">
              Find a professional
            </Link>
          </div>
        </section>

        <Link
          className="mobile-home-professional-join"
          href="/sign-up?intent=professional"
        >
          Join as a professional <span aria-hidden>→</span>
        </Link>
        <Link className="mobile-home-discover-link" href="/discover">
          Discover more beauty inspiration
          <span aria-hidden>→</span>
        </Link>
        {!signedIn && <HomeMarketplaceGuide />}
        {signedIn && (
          <section
            className="mobile-home-account"
            aria-label="Your account at a glance"
          >
            <h2>Your account at a glance</h2>
            <article>
              <h3>Upcoming Booking</h3>
              <p>
                {summary?.nextBooking
                  ? `${summary.nextBooking.serviceName} · ${summary.nextBooking.professionalName}`
                  : summary
                    ? "No upcoming bookings"
                    : "Booking summary unavailable"}
              </p>
              {summary?.nextBooking && (
                <p>
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/London",
                  }).format(new Date(summary.nextBooking.startsAt))}
                </p>
              )}
              <Link
                href={
                  summary?.nextBooking
                    ? `/account/bookings/${summary.nextBooking.id}`
                    : "/account/bookings"
                }
              >
                View bookings
              </Link>
            </article>
            <article>
              <h3>Messages</h3>
              <p>
                {summary
                  ? summary.messages.unreadCount
                    ? `${summary.messages.unreadCount} unread messages`
                    : summary.messages.conversationCount
                      ? "Messages up to date"
                      : "No conversations yet"
                  : "Message summary unavailable"}
              </p>
              <Link href="/messages">Open messages</Link>
            </article>
            <article>
              <h3>Wallet & payments</h3>
              <p>
                {summary
                  ? `${money(summary.payments.capturedPence)} deposits paid`
                  : "Payment summary unavailable"}
              </p>
              {summary && (
                <p>
                  {summary.payments.pendingRefundPence > 0
                    ? `${money(summary.payments.pendingRefundPence)} refund processing`
                    : summary.payments.refundedPence > 0
                      ? `${money(summary.payments.refundedPence)} refunded`
                      : "No refunds recorded"}
                </p>
              )}
              <Link href="/wallet">View payments</Link>
            </article>
          </section>
        )}
        {professionals.length > 0 && (
          <section
            className="mobile-home-professionals"
            aria-label="Recommended professionals"
          >
            <div className="mobile-home-section-title">
              <h2>Meet the professionals</h2>
              <Link href="/explore">See all</Link>
            </div>
            {professionals.slice(0, 4).map((professional) => (
              <ProfessionalCard
                key={professional.id}
                professional={professional}
              />
            ))}
          </section>
        )}
        <section className="mobile-home-inspiration">
          <h2>A little inspiration</h2>
          <nav aria-label="Beauty inspiration">
            <Link href="/explore">The Hair Edit</Link>
            <Link href="/explore">Nail Inspiration</Link>
            <Link href="/explore">Beauty Looks</Link>
            <Link href="/explore">Your next beauty space</Link>
          </nav>
          <Link className="mobile-home-shop-link" href="/shop">
            Shop beauty essentials →
          </Link>
        </section>
        <HomeStory />
      </main>
      <BottomNavigation active="home" signedIn={signedIn} />
    </div>
  );
}
