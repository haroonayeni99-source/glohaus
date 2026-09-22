"use client";

import Link from "next/link";
import {
  CalendarDays,
  Home,
  Search,
  ShoppingBag,
  UserRound,
} from "lucide-react";

const items = [
  { id: "home", href: "/", label: "Home", icon: Home },
  { id: "search", href: "/explore", label: "Search", icon: Search },
  { id: "bookings", href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { id: "shop", href: "/shop", label: "Shop", icon: ShoppingBag },
  { id: "profile", href: "/workspace", label: "Profile", icon: UserRound },
] as const;

export function BottomNavigation({ active }: { active: (typeof items)[number]["id"] }) {
  return (
    <nav className="glohaus-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active === item.id ? "page" : undefined}
          >
            <Icon size={20} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
