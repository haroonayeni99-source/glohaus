import {
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Radio,

  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type {
  AdminFinanceOverview,
  AdminOverview,
  OwnerAuthAccount,
  OwnerBookingFeeRule,
  OwnerControls,
  OwnerProfessionalCommission,
  OwnerProfessionalReferral,
} from "@/modules/admin/repository";
import type { Account } from "@/modules/accounts/domain";
import { OwnerAdminSearch } from "@/components/owner-admin-search";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function dailyBookingSeries(bookings: NonNullable<AdminOverview["bookings"]>) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = new Date();
  const rows = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (13 - index));
    return { key: formatter.format(date), label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(date), count: 0 };
  });
  const map = new Map(rows.map((row) => [row.key, row]));
  bookings.forEach((booking) => {
    const key = formatter.format(new Date(booking.starts_at));
    const row = map.get(key);
    if (row) row.count += 1;
  });
  return rows;
}

function Chart({ bookings }: { bookings: NonNullable<AdminOverview["bookings"]> }) {
  const rows = dailyBookingSeries(bookings);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const coords = rows.map((row, index) => {
    const x = (index / Math.max(1, rows.length - 1)) * 100;
    const y = 88 - (row.count / max) * 68;
    return [x, y] as const;
  });
  const points = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,92 ${points} 100,92`;

  return (
    <div className="owner-performance-chart" aria-label="Booking activity over the last 14 days">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="ownerChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} className="owner-chart-grid" />)}
        <polygon points={area} fill="url(#ownerChartFill)" className="owner-chart-area" />
        <polyline points={points} className="owner-chart-line" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="owner-chart-axis">
        <span>{rows[0]?.label}</span>
        <span>{rows[Math.floor(rows.length / 2)]?.label}</span>
        <span>{rows.at(-1)?.label}</span>
      </div>
    </div>
  );
}

export function OwnerDashboardOverview({
  account,
  data,
  finance,
  bookingFee,
  authAccounts,
  commissions,
  referrals,
  owner,
}: {
  account: Account;
  data: AdminOverview;
  finance: AdminFinanceOverview | null;
  bookingFee: OwnerBookingFeeRule | null;
  authAccounts: OwnerAuthAccount[];
  commissions: OwnerProfessionalCommission[];
  referrals: OwnerProfessionalReferral[];
  owner: OwnerControls | null;
}) {
  const bookings = data.bookings ?? [];
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayBookings = bookings.filter((booking) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(booking.starts_at)) === todayKey
  ).length;
  const verified = data.professionalTrust?.filter((p) => p.verification_status === "verified").length ?? 0;
  const pending = data.professionalTrust?.filter((p) => p.verification_status === "pending").length ?? 0;
  const restricted = data.professionalTrust?.filter((p) => p.standing_status === "restricted").length ?? 0;
  const liveEnabled = data.professionalTrust?.filter((p) => p.verification_status === "verified" && p.standing_status === "good" && !p.live_restricted_until).length ?? 0;
  const topReferrers = referrals.slice(0, 5);
  const recentAudit = owner?.audit.slice(0, 5) ?? [];
  const activeStaff = owner?.staff.filter((person) => person.status === "active").slice(0, 5) ?? [];
  const currentFee = bookingFee?.fixedFeePence ?? 100;
  const revenue = finance?.metrics.platformRevenuePence ?? 0;

  return (
    <>
      <header className="owner-topbar">
        <div>
          <h1>GLOHAUS Owner Control Centre</h1>
          <p>Manage your beauty marketplace · Users · Professionals · Bookings · Revenue · Growth</p>
        </div>
        <div className="owner-topbar-actions">
          <OwnerAdminSearch
            users={data.users}
            professionals={(data.professionalTrust ?? []).map((pro) => ({
              id: pro.id,
              business_name: pro.business_name,
            }))}
            bookings={bookings.map((booking) => ({
              id: booking.id,
              service_name: booking.service_name,
              professional_name: booking.professional_name,
              customer_name: booking.customer_name,
            }))}
          />
          <div className="owner-date-chip"><CalendarDays size={16} aria-hidden /><span>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date())}<small>Owner workspace</small></span></div>
          <div className="owner-profile-chip"><span>{account.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{account.displayName}</strong><small>Owner · GLOHAUS</small></div></div>
        </div>
      </header>

      <section id="overview" className="owner-dashboard-overview">
        <div className="owner-kpi-grid">
          <article className="owner-kpi-card owner-kpi-blue">
            <div className="owner-kpi-icon"><UsersRound size={22} /></div>
            <div><span>Total Users</span><strong>{data.counts.users.toLocaleString("en-GB")}</strong><small><TrendingUp size={13} /> {data.counts.active.toLocaleString("en-GB")} active accounts</small></div>
            <div className="owner-mini-bars">{[4,7,5,9,11,14,17].map((h,i)=><i key={i} style={{height:`${h * 2}px`}} />)}</div>
          </article>
          <article className="owner-kpi-card owner-kpi-purple">
            <div className="owner-kpi-icon"><UserRoundCheck size={22} /></div>
            <div><span>Active Professionals</span><strong>{data.professionals.toLocaleString("en-GB")}</strong><small><TrendingUp size={13} /> {verified} verified</small></div>
            <div className="owner-mini-bars">{[3,5,4,8,10,13,16].map((h,i)=><i key={i} style={{height:`${h * 2}px`}} />)}</div>
          </article>
          <article className="owner-kpi-card owner-kpi-amber">
            <div className="owner-kpi-icon"><CalendarDays size={22} /></div>
            <div><span>Today&apos;s Bookings</span><strong>{todayBookings.toLocaleString("en-GB")}</strong><small>{bookings.length} recent bookings visible</small></div>
            <div className="owner-mini-bars">{[4,4,7,6,10,14,18].map((h,i)=><i key={i} style={{height:`${h * 2}px`}} />)}</div>
          </article>
          <article className="owner-kpi-card owner-kpi-green">
            <div className="owner-kpi-icon"><CircleDollarSign size={22} /></div>
            <div><span>Platform Revenue</span><strong>{money(revenue)}</strong><small>{finance ? `${money(finance.metrics.platformRevenue30dPence)} in last 30 days` : "Finance data unavailable"}</small></div>
            <div className="owner-mini-bars">{[3,6,5,9,12,15,19].map((h,i)=><i key={i} style={{height:`${h * 2}px`}} />)}</div>
          </article>
        </div>

        <div className="owner-dashboard-main-grid">
          <article className="owner-dashboard-card owner-performance-card">
            <div className="owner-card-heading">
              <div><strong>Platform Performance</strong><span>Bookings, revenue and marketplace activity</span></div>
              <span className="owner-filter-chip">Last 14 days</span>
            </div>
            <div className="owner-tab-row"><span className="is-active">Bookings</span><span>Revenue</span><span>Users</span><span>Orders</span></div>
            <div className="owner-performance-inner">
              <Chart bookings={bookings} />
              <div className="owner-booking-summary">
                <strong>Booking Overview</strong>
                {[
                  ["Total bookings", bookings.length, "blue"],
                  ["Confirmed", bookings.filter((b) => b.status === "confirmed").length, "green"],
                  ["Completed", bookings.filter((b) => b.status === "completed").length, "green"],
                  ["Cancelled", bookings.filter((b) => b.status === "cancelled").length, "red"],
                ].map(([label,value,tone]) => (
                  <div key={String(label)}><span className={`owner-dot owner-dot-${tone}`} /><span>{label}</span><strong>{Number(value).toLocaleString("en-GB")}</strong></div>
                ))}
              </div>
            </div>
          </article>

          <article className="owner-dashboard-card owner-trust-card">
            <div className="owner-card-heading"><div><strong>Professional Verification & LIVE Access</strong><span>Marketplace trust controls</span></div><a href="#live-access">View all →</a></div>
            <div className="owner-trust-list">
              <div><span className="owner-status-icon is-green"><BadgeCheck size={17}/></span><span>Verified Professionals</span><strong>{verified}</strong></div>
              <div><span className="owner-status-icon is-amber"><Clock3 size={17}/></span><span>Pending Verification</span><strong>{pending}</strong></div>
              <div><span className="owner-status-icon is-red"><ShieldAlert size={17}/></span><span>Restricted / Suspended</span><strong>{restricted}</strong></div>
            </div>
            <div className="owner-live-panel">
              <div className="owner-card-heading"><div><strong><Radio size={16}/> LIVE Access Status</strong></div><a href="#live-access">Manage →</a></div>
              <div className="owner-live-stats"><span><i className="is-green"/><small>LIVE Enabled</small><strong>{liveEnabled}</strong></span><span><i className="is-amber"/><small>Pending</small><strong>{pending}</strong></span><span><i className="is-red"/><small>Restricted</small><strong>{restricted}</strong></span></div>
            </div>
          </article>
        </div>

        <div className="owner-dashboard-secondary-grid">
          <article className="owner-dashboard-card owner-fee-summary">
            <div className="owner-card-heading"><div><strong>Customer Booking Fee</strong></div><a href="#booking-fee">Edit</a></div>
            <strong className="owner-big-money">£{(currentFee / 100).toFixed(2)}</strong>
            <span>Current customer booking fee (per booking)</span>
            <p>This fee is shown to customers before checkout and can be changed by the Owner for future bookings.</p>
          </article>

          <article className="owner-dashboard-card owner-commission-summary">
            <div className="owner-card-heading"><div><strong>Professional Commission Rates</strong></div><a href="#professional-commission">Edit rates</a></div>
            <div className="owner-mini-table">
              <div className="owner-mini-table-head"><span>Plan</span><span>Rate</span><span>Status</span></div>
              {(["trial","starter","pro","premium"] as const).map((plan) => {
                const rows = commissions.filter((row) => row.planKey === plan);
                const rate = rows[0]?.defaultBasisPoints ?? (plan === "trial" ? 1000 : plan === "starter" ? 800 : plan === "pro" ? 600 : 400);
                return <div key={plan}><span>{plan === "trial" ? "Trial Pro" : plan[0].toUpperCase()+plan.slice(1)}</span><strong>{(rate/100).toFixed(rate % 100 ? 2 : 0)}%</strong><em>Active</em></div>;
              })}
            </div>
          </article>

          <article className="owner-dashboard-card owner-auth-summary">
            <div className="owner-card-heading"><div><strong>Auth Accounts</strong></div><a href="#auth-accounts">View details →</a></div>
            <div className="owner-auth-rows">
              <div><span>Total Sign Ups</span><strong>{authAccounts.length.toLocaleString("en-GB")}</strong></div>
              <div><span>Email confirmed</span><strong>{authAccounts.filter((a)=>a.emailConfirmedAt).length.toLocaleString("en-GB")}</strong></div>
              <div><span>Linked app accounts</span><strong>{authAccounts.filter((a)=>a.appUserId).length.toLocaleString("en-GB")}</strong></div>
              <div><span>Signed in before</span><strong>{authAccounts.filter((a)=>a.lastSignInAt).length.toLocaleString("en-GB")}</strong></div>
            </div>
          </article>
        </div>

        <div className="owner-dashboard-bottom-grid">
          <article className="owner-dashboard-card">
            <div className="owner-card-heading"><div><strong>Top Referrers</strong></div><a href="#referrals">View all →</a></div>
            <div className="owner-leaderboard">
              <div className="owner-leaderboard-head"><span>#</span><span>Professional</span><span>Code</span><span>Total</span><span>Customers</span><span>Pros</span></div>
              {topReferrers.map((row,index)=><div key={row.professionalId}><span>{index+1}</span><span>{row.businessName}</span><code>{row.code}</code><strong>{row.totalReferrals}</strong><span>{row.customerReferrals}</span><span>{row.professionalReferrals}</span></div>)}
              {!topReferrers.length && <p>No referral activity yet.</p>}
            </div>
          </article>

          <article className="owner-dashboard-card">
            <div className="owner-card-heading"><div><strong>Staff & Admins</strong></div><a href="#staff">Manage →</a></div>
            <div className="owner-staff-list">
              {activeStaff.map((person)=><div key={person.id}><span className="owner-staff-avatar">{person.display_name.slice(0,1).toUpperCase()}</span><span><strong>{person.display_name}</strong><small>{person.roles.join(", ")}</small></span><em><i/>Active</em></div>)}
              {!activeStaff.length && <p>No delegated staff yet.</p>}
            </div>
          </article>

          <article className="owner-dashboard-card">
            <div className="owner-card-heading"><div><strong>Owner Audit Log</strong></div><a href="#audit">View all →</a></div>
            <div className="owner-audit-preview">
              {recentAudit.map((entry)=><div key={entry.id}><span>{new Date(entry.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"})}</span><strong>{entry.action.replaceAll("_"," ")}</strong><small>{entry.reason}</small></div>)}
              {!recentAudit.length && <p>No owner audit events yet.</p>}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
