import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  ImagePlus,
  Plus,
  Star,
  UserRoundCheck,
} from "lucide-react";
import type { Account } from "@/modules/accounts/domain";
import type { ProfessionalDashboard as DashboardData } from "@/modules/dashboard/repository";
import { money } from "@/modules/professionals/domain";
import { ProfessionalNavigation } from "./professional-navigation";

function appointmentDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function ProfessionalDashboard({
  account,
  data,
}: {
  account: Account;
  data: DashboardData;
}) {
  const businessName = data.profile?.businessName || account.displayName;
  const incomplete =
    !data.profile ||
    data.profile.publicationStatus !== "published" ||
    data.stats.activeServices === 0;
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="dashboard" displayName={account.displayName} />
      <main id="main" className="pro-main">
        <section className="pro-welcome">
          <div>
            <p className="pro-kicker">GLOHAUS PRO</p>
            <h1>Good to see you, {account.displayName}.</h1>
            <p>
              {incomplete
                ? "Finish the essentials to make your business page ready for clients."
                : `${businessName} is ready for appointments. Keep your week in view here.`}
            </p>
          </div>
          <Link className="pro-icon-button" href="/professional/profile" aria-label="Manage your profile">
            <Plus size={20} aria-hidden />
            <span>Manage profile</span>
          </Link>
        </section>

        {incomplete && (
          <section className="pro-setup-card" aria-label="Complete your setup">
            <div>
              <span className="pro-inline-icon"><UserRoundCheck size={17} aria-hidden /></span>
              <div>
                <p className="pro-kicker">YOUR BUSINESS SETUP</p>
                <h2>Make your page ready to book.</h2>
                <p>
                  Add the details clients need, set working hours and publish an active service.
                </p>
              </div>
            </div>
            <Link className="pro-pink-button" href="/professional/setup">
              Continue setup <ArrowUpRight size={16} aria-hidden />
            </Link>
          </section>
        )}

        <section className="pro-stat-grid" aria-label="Business overview">
          <article>
            <CalendarDays size={19} aria-hidden />
            <strong>{data.stats.newBookings}</strong>
            <span>New bookings today</span>
          </article>
          <article>
            <Clock3 size={19} aria-hidden />
            <strong>{data.stats.upcomingAppointments}</strong>
            <span>Upcoming appointments</span>
          </article>
          <article>
            <CircleDollarSign size={19} aria-hidden />
            <strong>
              {data.wallet ? money(data.wallet.pendingPence) : "Unavailable"}
            </strong>
            <span>Pending earnings</span>
          </article>
          <article>
            <Star size={19} aria-hidden />
            <strong>
              {data.stats.rating === null ? "—" : data.stats.rating.toFixed(1)}
            </strong>
            <span>
              {data.stats.reviewCount
                ? `${data.stats.reviewCount} verified ${data.stats.reviewCount === 1 ? "review" : "reviews"}`
                : "No reviews yet"}
            </span>
          </article>
        </section>

        <section className="pro-quick-actions" aria-label="Professional quick actions">
          <Link href="/professional/bookings">
            <CalendarDays size={18} aria-hidden />
            <span><strong>Bookings</strong><small>See your upcoming week</small></span>
          </Link>
          <Link href="/professional/profile">
            <Plus size={18} aria-hidden />
            <span><strong>Manage services</strong><small>Update your menu and pricing</small></span>
          </Link>
          <Link href="/professional/availability">
            <Clock3 size={18} aria-hidden />
            <span><strong>Availability</strong><small>Set hours and time off</small></span>
          </Link>
          <Link href="/professional/posts">
            <ImagePlus size={18} aria-hidden />
            <span><strong>Create a post</strong><small>Share a look or tutorial</small></span>
          </Link>
        </section>

        <section className="pro-dashboard-grid">
          <section className="pro-panel pro-appointments-panel">
            <div className="pro-panel-title">
              <div>
                <p className="pro-kicker">YOUR WEEK</p>
                <h2>Upcoming appointments</h2>
              </div>
              <Link href="/professional/bookings">View all <ArrowUpRight size={15} aria-hidden /></Link>
            </div>
            {data.upcoming.length ? (
              <div className="pro-appointment-list">
                {data.upcoming.map((booking) => (
                  <Link href={`/account/bookings/${booking.id}`} key={booking.id}>
                    <time>{appointmentDate(booking.starts_at)}</time>
                    <div>
                      <strong>{booking.service_name}</strong>
                      <span>{booking.customer_name}</span>
                    </div>
                    <span className={`pro-status pro-status-${booking.status}`}>
                      {booking.status.replaceAll("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="pro-empty-state">
                <CalendarDays size={29} aria-hidden />
                <h3>No upcoming appointments</h3>
                <p>When clients confirm a booking, it will appear here.</p>
                <Link href="/professional/availability">Review availability</Link>
              </div>
            )}
          </section>

          <aside className="pro-side-stack">
            <section className="pro-wallet-card">
              <div className="pro-panel-title">
                <div>
                  <p className="pro-kicker">WALLET</p>
                  <h2>Available to withdraw</h2>
                </div>
                <CircleDollarSign size={23} aria-hidden />
              </div>
              <strong className="pro-wallet-total">
                {data.wallet ? money(data.wallet.availablePence) : "Unavailable"}
              </strong>
              <p>
                {data.wallet
                  ? `${money(data.wallet.reservedPence)} reserved · ${money(data.wallet.processingPence)} processing`
                  : "Your protected wallet will appear when financial records are available."}
              </p>
              <Link href="/professional/wallet" className="pro-dark-button">
                View wallet <ArrowUpRight size={16} aria-hidden />
              </Link>
            </section>
            <section className="pro-panel pro-profile-panel">
              <Eye size={20} aria-hidden />
              <p className="pro-kicker">YOUR STOREFRONT</p>
              <h2>{data.stats.activeServices} active {data.stats.activeServices === 1 ? "service" : "services"}</h2>
              <p>
                {data.profile?.publicationStatus === "published"
                  ? "Your public page is live and can receive bookings for your available services."
                  : "Your page is private until you publish the profile and add the booking essentials."}
              </p>
              <Link href="/professional/profile">Edit your page <ArrowUpRight size={15} aria-hidden /></Link>
            </section>
          </aside>
        </section>
        <p className="pro-footnote">
          <CheckCircle2 size={15} aria-hidden /> Your appointments and financial data are visible only to your authorised business account.
        </p>
      </main>
    </div>
  );
}
