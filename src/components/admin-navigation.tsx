import Link from "next/link";
import {
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  FileWarning,
  LayoutDashboard,
  MessageSquareWarning,
  PackageCheck,
  Radio,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AccountControls } from "@/components/account-controls";
import type { Account } from "@/modules/accounts/domain";

const coreSections = [
  ["Overview", "overview", LayoutDashboard],
  ["App Users", "users", UsersRound],
  ["Professionals", "professionals", BadgeCheck],
  ["Bookings", "bookings", CalendarDays],
  ["Orders", "orders", PackageCheck],
  ["Payments", "payments", CreditCard],
  ["Analytics", "analytics", BarChart3],
  ["LIVE", "live-access", Radio],
  ["Content", "content", BookOpenCheck],
  ["Reports", "reports", FileWarning],
  ["Reviews", "reviews", MessageSquareWarning],
  ["Settings", "settings", Settings],
] as const;

const ownerSections = [
  ["Shop Fees", "shop-fees", CreditCard],
  ["Staff & Admins", "staff", ShieldCheck],
  ["Audit Log", "audit", BarChart3],
] as const;

export function AdminNavigation({ account }: { account: Account }) {
  const owner = account.roles.includes("owner");
  const sections = owner ? [...coreSections, ...ownerSections] : coreSections;
  return (
    <aside className="admin-navigation" aria-label="Administration navigation">
      <Link className="admin-navigation-brand" href="/admin">
        <ShieldCheck size={20} aria-hidden />
        <span>GLOHAUS {owner ? "OWNER" : "ADMIN"}</span>
      </Link>
      <p className="admin-navigation-identity">
        {account.displayName}
        <small>{owner ? "Owner · Super Admin" : "Administrator"}</small>
      </p>
      <nav>
        {sections.map(([label, id, Icon]) => (
          <a key={id} href={`#${id}`} aria-current={id === "overview" ? "page" : undefined}>
            <Icon size={16} aria-hidden />
            {label}
          </a>
        ))}
      </nav>
      <div className="admin-navigation-bottom">
        <Link href="/workspace">Return to GLOHAUS</Link>
        <AccountControls />
      </div>
    </aside>
  );
}
