import Link from "next/link";
import {
  CalendarDays,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Brand } from "./brand";
import { AccountControls } from "./account-controls";

const items = [
  { id: "dashboard", href: "/professional", label: "Dashboard", icon: LayoutDashboard },
  { id: "bookings", href: "/professional/bookings", label: "Bookings", icon: CalendarDays },
  { id: "clients", href: "/professional/clients", label: "Clients", icon: UsersRound },
  { id: "wallet", href: "/professional/wallet", label: "Wallet", icon: WalletCards },
  { id: "more", href: "/professional/profile", label: "More", icon: MoreHorizontal },
] as const;

export type ProfessionalNavigationItem = (typeof items)[number]["id"];

export function ProfessionalNavigation({
  active,
  displayName,
}: {
  active: ProfessionalNavigationItem;
  displayName: string;
}) {
  return (
    <>
      <header className="pro-header">
        <div className="pro-header-brand">
          <Brand pro inverse />
          <span>PROFESSIONAL DASHBOARD</span>
        </div>
        <div className="pro-header-account">
          <Link className="pro-create-post" href="/professional/posts">
            <Plus size={15} aria-hidden />
            Create post
          </Link>
          <span className="pro-account-initial" aria-hidden>
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="pro-account-name">{displayName}</span>
          <AccountControls />
        </div>
      </header>
      <nav className="pro-desktop-nav" aria-label="Professional navigation">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active === item.id ? "page" : undefined}
            >
              <Icon size={17} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <nav className="pro-mobile-nav" aria-label="Professional navigation">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active === item.id ? "page" : undefined}
            >
              <Icon size={19} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
