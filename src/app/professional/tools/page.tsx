import Link from "next/link";
import {
  CalendarDays,
  Eye,
  ChevronRight,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  Paintbrush,
  PenSquare,
  ShieldCheck,
  BadgeCheck,
  Star,
  Megaphone,
  ThumbsUp,
  Bell,
  Compass,
  MessageSquare,
  PackageCheck,
  ShoppingBag,
  WalletCards,
  BadgePoundSterling,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Business tools · GLOHAUS PRO" };
const tools = [
  ["Go LIVE", "Broadcast tutorials and connect with your community", "/professional/live", Eye],
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
    "/messages?view=professional",
    MessageSquare,
  ],
  [
    "Shop / Products",
    "Create products, publish verified listings and manage stock",
    "/professional/products",
    ShoppingBag,
  ],
  [
    "Orders & fulfilment",
    "Process paid Shop orders, dispatch items and add tracking",
    "/professional/orders",
    PackageCheck,
  ],
  [
    "Wallet & earnings",
    "Your deposits and financial activity",
    "/professional/wallet",
    WalletCards,
  ],
  [
    "Plans & fees",
    "Your commission, subscriptions and withdrawal fees",
    "/professional/plans",
    BadgePoundSterling,
  ],
  [
    "Verification",
    "Identity verification and access to higher-trust marketplace features",
    "/professional/profile#verification",
    BadgeCheck,
  ],
  ["Notifications", "Booking reminders, Shop updates and account activity", "/notifications?view=professional", Bell],
  ["Marketing preferences", "Choose optional customer-growth and business emails", "/preferences", Megaphone],
  ["Feature votes", "Privately vote on what GLOHAUS should build next", "/feature-votes", ThumbsUp],
  [
    "Account & security",
    "Manage your secure session and account security",
    "/security",
    ShieldCheck,
  ],
  ["Customer account", "Switch to your signed-in customer experience", "/account", Compass],
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
        <h1>Your business tools</h1>
        <p className="pro-page-lead">
          Manage your bookings, Shop, verification, content, money and account tools from one place.
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
