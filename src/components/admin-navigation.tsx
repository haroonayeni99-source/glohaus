import Link from "next/link";
import {
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  FileWarning,
  LayoutDashboard,
  MessageSquareWarning,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AccountControls } from "@/components/account-controls";
import type { Account } from "@/modules/accounts/domain";

const sections = [
  ["Overview", "overview", LayoutDashboard],
  ["Users", "users", UsersRound],
  ["Professionals", "professionals", BadgeCheck],
  ["Bookings", "bookings", CalendarDays],
  ["Reports", "reports", FileWarning],
  ["Content", "content", BookOpenCheck],
  ["Reviews", "reviews", MessageSquareWarning],
  ["Staff & admins", "staff", ShieldCheck],
  ["Audit log", "audit", BarChart3],
  ["Settings", "settings", Settings],
] as const;
const pendingSections = [["Verification", BadgeCheck], ["Analytics", BarChart3], ["Notifications", MessageSquareWarning]] as const;

export function AdminNavigation({ account }: { account: Account }) {
  const owner = account.roles.includes("owner");
  return (
    <aside className="admin-navigation" aria-label="Administration navigation">
      <Link className="admin-navigation-brand" href="/admin">
        <ShieldCheck size={20} aria-hidden />
        <span>GLOHAUS {owner ? "OWNER" : "ADMIN"}</span>
      </Link>
      <p className="admin-navigation-identity">
        {account.displayName}
        <small>{owner ? "Owner" : "Administrator"}</small>
      </p>
      <nav>
        {sections.map(([label, id, Icon]) => (
          <a key={id} href={`#${id}`} aria-current={id === "overview" ? "page" : undefined}>
            <Icon size={16} aria-hidden />
            {label}
          </a>
        ))}
        {pendingSections.map(([label, Icon]) => (
          <span className="admin-navigation-pending" key={label} aria-disabled="true">
            <Icon size={16} aria-hidden />
            {label}<small>Not connected</small>
          </span>
        ))}
      </nav>
      <div className="admin-navigation-bottom">
        <Link href="/workspace">Return to GLOHAUS</Link>
        <AccountControls />
      </div>
    </aside>
  );
}
