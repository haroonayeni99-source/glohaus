import Link from "next/link";
import {
  CalendarDays,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  UsersRound,
  WalletCards,
  ArrowLeftRight,
  ShoppingBag,
  PackageCheck,
  ShieldCheck,
  Bell,
} from "lucide-react";
import { Brand } from "./brand";
import { AccountControls } from "./account-controls";

const items = [
  { id: "dashboard", href: "/professional", label: "Dashboard", icon: LayoutDashboard },
  { id: "bookings", href: "/professional/bookings", label: "Bookings", icon: CalendarDays },
  { id: "clients", href: "/professional/clients", label: "Clients", icon: UsersRound },
  { id: "wallet", href: "/professional/wallet", label: "Wallet", icon: WalletCards },
  { id: "more", href: "/professional/tools", label: "Tools", icon: MoreHorizontal },
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
          <nav className="pro-header-shortcuts" aria-label="Professional shortcuts">
            <Link href="/professional/products">
              <ShoppingBag size={14} aria-hidden />
              Products
            </Link>
            <Link href="/professional/orders">
              <PackageCheck size={14} aria-hidden />
              Orders
            </Link>
            <Link href="/professional/profile#verification">
              <ShieldCheck size={14} aria-hidden />
              Verification
            </Link>
            <Link href="/notifications?view=professional">
              <Bell size={14} aria-hidden />
              Notifications
            </Link>
          </nav>
          <Link className="pro-create-post" href="/account">
            <ArrowLeftRight size={15} aria-hidden />
            Customer view
          </Link>
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
