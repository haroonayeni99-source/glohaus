import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Eye,
  ImagePlus,
  LockKeyhole,
  Radio,
  Star,
  Users,
} from "lucide-react";
import { Brand } from "./brand";

export function ProfessionalDashboardPreview() {
  return (
    <div className="pro-app professional-dashboard-preview">
      <header className="pro-header">
        <div className="pro-header-brand">
          <Brand pro inverse />
          <span>PROFESSIONAL DASHBOARD PREVIEW</span>
        </div>
        <div className="pro-header-account">
          <span className="pro-account-initial" aria-hidden>A</span>
          <span className="pro-account-name">Amina Studio</span>
          <Link className="text-link" href="/sign-up?intent=professional">
            Create account
          </Link>
        </div>
      </header>

      <nav className="pro-desktop-nav" aria-label="Professional preview navigation">
        {["Dashboard", "Bookings", "Clients", "Wallet", "More"].map((item, index) => (
          <span key={item} aria-current={index === 0 ? "page" : undefined}>
            {item}
          </span>
        ))}
      </nav>

      <main id="main" className="pro-main">
        <div className="pro-preview-banner">
          PREVIEW ONLY · SAMPLE DATA · NO LIVE BOOKINGS OR MONEY MOVEMENT
        </div>

        <section className="pro-welcome">
          <div>
            <p className="pro-kicker">GLOHAUS PRO</p>
            <h1>Good to see you, Amina.</h1>
            <p>
              This is the professional point of view: business activity, bookings,
              earnings, clients and your public storefront in one workspace.
            </p>
          </div>
          <Link className="pro-icon-button" href="/professional-preview">
            <Eye size={20} aria-hidden />
            <span>View public page</span>
          </Link>
        </section>

        <section className="pro-stat-grid" aria-label="Example business overview">
          <article>
            <CalendarDays size={19} aria-hidden />
            <strong>3</strong>
            <span>New bookings today</span>
          </article>
          <article>
            <Clock3 size={19} aria-hidden />
            <strong>8</strong>
            <span>Upcoming appointments</span>
          </article>
          <article>
            <CircleDollarSign size={19} aria-hidden />
            <strong>£184.00</strong>
            <span>Pending earnings</span>
          </article>
          <article>
            <Star size={19} aria-hidden />
            <strong>4.9</strong>
            <span>128 verified reviews</span>
          </article>
        </section>

        <section className="pro-live-card" aria-label="Example LIVE eligibility">
          <div className="pro-panel-title">
            <div>
              <p className="pro-kicker">GLOHAUS LIVE</p>
              <h2>Build your community. Unlock LIVE.</h2>
            </div>
            <Radio size={24} aria-hidden />
          </div>
          <div className="pro-live-requirements">
            <div>
              <span><Users size={17} aria-hidden /> Followers</span>
              <strong>326 / 500</strong>
              <progress max={500} value={326} />
            </div>
            <div>
              <span><CalendarDays size={17} aria-hidden /> Completed bookings</span>
              <strong>7 / 10</strong>
              <progress max={10} value={7} />
            </div>
          </div>
          <button className="pro-dark-button pro-live-locked" type="button" disabled>
            <LockKeyhole size={16} aria-hidden /> LIVE locked
          </button>
        </section>

        <section className="pro-quick-actions" aria-label="Example professional actions">
          <span><CalendarDays size={18} aria-hidden /><b>Bookings</b><small>See your upcoming week</small></span>
          <span><Users size={18} aria-hidden /><b>Clients</b><small>View your customer history</small></span>
          <span><Clock3 size={18} aria-hidden /><b>Availability</b><small>Set working hours</small></span>
          <span><ImagePlus size={18} aria-hidden /><b>Create a post</b><small>Share your work</small></span>
        </section>

        <section className="pro-dashboard-grid">
          <section className="pro-panel pro-appointments-panel">
            <div className="pro-panel-title">
              <div>
                <p className="pro-kicker">YOUR WEEK</p>
                <h2>Upcoming appointments</h2>
              </div>
            </div>
            <div className="pro-appointment-list">
              {[
                ["Fri 26 Sep · 10:00", "Silk Press", "Maya"],
                ["Fri 26 Sep · 13:30", "Knotless Braids", "Leah"],
                ["Sat 27 Sep · 11:00", "Curl Treatment", "Nia"],
              ].map(([time, service, customer]) => (
                <div className="pro-preview-appointment" key={time}>
                  <time>{time}</time>
                  <div><strong>{service}</strong><span>{customer}</span></div>
                  <span className="pro-status pro-status-confirmed">confirmed</span>
                </div>
              ))}
            </div>
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
              <strong className="pro-wallet-total">£412.50</strong>
              <p>£184.00 reserved · £65.00 processing</p>
              <span className="pro-dark-button">View wallet</span>
            </section>
            <section className="pro-panel pro-profile-panel">
              <Eye size={20} aria-hidden />
              <p className="pro-kicker">YOUR STOREFRONT</p>
              <h2>5 active services</h2>
              <p>Your public page is live and ready to receive bookings.</p>
              <Link href="/professional-preview">
                View example storefront <ArrowUpRight size={15} aria-hidden />
              </Link>
            </section>
          </aside>
        </section>

        <div className="pro-preview-actions">
          <Link className="pro-pink-button" href="/sign-up?intent=professional">
            Create a professional account <ArrowUpRight size={16} aria-hidden />
          </Link>
          <Link className="text-link" href="/sign-in?intent=professional">
            Professional sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
