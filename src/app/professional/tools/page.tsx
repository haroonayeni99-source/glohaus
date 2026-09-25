import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  Paintbrush,
  PenSquare,
  ShieldCheck,
  Star,
  Bell,
  Compass,
  MessageSquare,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Business tools · GLOHAUS PRO" };
const tools = [
  [
    "Complete your setup",
    "Your step-by-step path to publishing",
    "/professional/setup",
    ListChecks,
  ],
  [
    "Edit your profile",
    "Your business, personality and social links",
    "/professional/profile",
    Paintbrush,
  ],
  [
    "Services & prices",
    "Create and manage your bookable menu",
    "/professional/services",
    ListChecks,
  ],
  [
    "Availability",
    "Weekly hours, breaks and time off",
    "/professional/availability",
    CalendarDays,
  ],
  [
    "Portfolio",
    "Showcase your work and transformations",
    "/professional/portfolio",
    ImagePlus,
  ],
  [
    "Posts & tutorials",
    "Share your expertise with the community",
    "/professional/posts",
    PenSquare,
  ],
  ["Reviews", "Read feedback from your clients", "/professional/reviews", Star],
  [
    "Messages",
    "Private conversations with your clients",
    "/messages",
    MessageSquare,
  ],
  [
    "Products & stock",
    "Create, publish and manage your shop catalogue",
    "/professional/products",
    ShoppingBag,
  ],
  [
    "Wallet & earnings",
    "Your deposits and financial activity",
    "/professional/wallet",
    WalletCards,
  ],
  ["Notifications", "Keep up with your appointments", "/notifications", Bell],
  [
    "Account & security",
    "Manage your session and verification",
    "/security",
    ShieldCheck,
  ],
  ["Customer experience", "Explore GLOHAUS as a customer", "/", Compass],
] as const;
export default async function ToolsPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  return (
    <div className="pro-app">
      <ProfessionalNavigation
        active="more"
        displayName={result.account.displayName}
      />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">MADE FOR YOUR BUSINESS</p>
        <h1>Your creator tools</h1>
        <p className="pro-page-lead">
          Everything you need to make your GLOHAUS page your own.
        </p>
        <nav className="tools-grid" aria-label="Business tools">
          {tools.map(([label, description, href, Icon]) => (
            <Link key={href} href={href} className="tool-card">
              <Icon size={23} aria-hidden />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          ))}
        </nav>
        <Link className="pro-back-link" href="/professional">
          <LayoutDashboard size={16} aria-hidden /> Back to dashboard
        </Link>
      </main>
    </div>
  );
}
