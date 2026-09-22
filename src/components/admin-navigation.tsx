import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AccountControls } from "@/components/account-controls";
import type { Account } from "@/modules/accounts/domain";

const sections = [
  ["Overview", "overview"],
  ["Users", "users"],
  ["Professionals", "professionals"],
  ["Bookings", "bookings"],
  ["Reports", "reports"],
  ["Content", "content"],
  ["Reviews", "reviews"],
  ["Staff & admins", "staff"],
  ["Audit log", "audit"],
] as const;
const pendingSections = ["Verification", "Analytics", "Notifications", "Settings"];

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
        {sections.map(([label, id]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
        {pendingSections.map((label) => (
          <span className="admin-navigation-pending" key={label} aria-disabled="true">
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
