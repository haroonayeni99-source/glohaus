import Link from "next/link";
import {
  BadgeCheck, CalendarDays, CircleDollarSign, Clock3, ImagePlus,
  MessageSquare, PackageCheck, Radio, Settings2, Star, Users
} from "lucide-react";
import { PublicHeader } from "@/components/public-header";

export const metadata = { title: "GLOHAUS PRO dashboard preview" };

const sections = {
  bookings: ["Bookings","View upcoming appointments, customer names, service details, status and booking actions."],
  services: ["Services & pricing","Create services, edit prices, set deposits and deactivate services."],
  availability: ["Availability","Set weekly working hours, time off, breaks and booking availability."],
  clients: ["Clients","See customers who have a genuine appointment relationship with your business."],
  messages: ["Messages","Review and reply to customer conversations connected to bookings."],
  portfolio: ["Portfolio","Upload and manage your work, looks and portfolio content."],
  products: ["Products","Create product drafts and, once verified, publish products for sale."],
  wallet: ["Wallet & earnings","Track pending, available, reserved and processing funds, then request withdrawals."],
  verification: ["Verification","Complete Stripe identity/KYC checks to unlock deposits, higher-value services, products and withdrawals."],
} as const;

const actions = [
  ["Bookings","Your upcoming week","bookings",CalendarDays],
  ["Services","Menu, pricing & deposits","services",Settings2],
  ["Availability","Hours, breaks & time off","availability",Clock3],
  ["Clients","Appointment relationships","clients",Users],
  ["Messages","Customer conversations","messages",MessageSquare],
  ["Portfolio","Showcase your work","portfolio",ImagePlus],
  ["Products","Shop inventory","products",PackageCheck],
  ["Wallet","Earnings & withdrawals","wallet",CircleDollarSign],
  ["Verification","Identity & marketplace access","verification",BadgeCheck],
] as const;

export default async function ProfessionalPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const selected = view && view in sections ? sections[view as keyof typeof sections] : null;

  return (
    <>
      <PublicHeader professional />
      <div className="pro-preview-auth-bar">
        <div>
          <strong>GLOHAUS PRO · DEMO WORKSPACE</strong>
          <span>Professional point of view — navigate the dashboard and tools without needing the live account database.</span>
        </div>
        <nav aria-label="Professional preview navigation">
          <Link href="/professional-preview">Dashboard</Link>
          <Link href="/customer-preview">Customer POV</Link>
          <Link href="/sign-in?intent=professional&returnTo=/professional">
            Professional sign in
          </Link>
          <Link className="button" href="/sign-up?intent=professional&returnTo=/professional/setup">
            Create PRO account
          </Link>
        </nav>
      </div>
      <main id="main" className="pro-main pro-preview-main">
        <section className="pro-welcome">
          <div>
            <p className="pro-kicker">GLOHAUS PRO</p>
            <h1>{selected?.[0] ?? "Professional dashboard"}</h1>
            <p>{selected?.[1] ?? "Manage bookings, clients, services, content, products and your protected wallet from one workspace."}</p>
          </div>
        </section>

        {!selected && (
          <>
            <section className="pro-setup-card">
              <div>
                <BadgeCheck size={20} aria-hidden />
                <div>
                  <p className="pro-kicker">IDENTITY & MARKETPLACE ACCESS</p>
                  <h2>Start free. Verify when you’re ready for more.</h2>
                  <p>Starter professionals can build a profile, post, message clients and accept up to 5 starter bookings. Verification unlocks paid deposits, higher-value services, product selling and withdrawals.</p>
                </div>
              </div>
              <Link className="pro-pink-button" href="/professional-preview?view=verification">View verification</Link>
            </section>

            <section className="pro-stat-grid">
              <article><CalendarDays size={19} aria-hidden /><strong>3</strong><span>Upcoming appointments</span></article>
              <article><CircleDollarSign size={19} aria-hidden /><strong>£145.00</strong><span>Pending earnings</span></article>
              <article><Star size={19} aria-hidden /><strong>4.9</strong><span>24 verified reviews</span></article>
              <article><Radio size={19} aria-hidden /><strong>186 / 500</strong><span>Followers toward LIVE</span></article>
            </section>

            <section className="pro-quick-actions" aria-label="Professional demo navigation">
              {actions.map(([label, description, key, Icon]) => (
                <Link href={"/professional-preview?view="+key} key={key}>
                  <Icon size={18} aria-hidden />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </Link>
              ))}
            </section>
          </>
        )}

        {selected && (
          <section className="pro-panel">
            <p className="pro-kicker">PROFESSIONAL DEMO VIEW</p>
            <h2>{selected[0]}</h2>
            <p>{selected[1]}</p>
            <div className="pro-quick-actions">
              <Link href="/professional-preview">Back to dashboard</Link>
              {view === "services" && <Link href="/professional-preview?view=availability">Set availability</Link>}
              {view === "wallet" && <Link href="/professional-preview?view=verification">Verification requirements</Link>}
              {view === "products" && <Link href="/shop">See customer shop</Link>}
              {view === "messages" && <Link href="/professional-preview?view=clients">View clients</Link>}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
