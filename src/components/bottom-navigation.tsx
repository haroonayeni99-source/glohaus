"use client";

import Link from "next/link";
import {
  CalendarDays,
  Compass,
  Home,
  MessageSquare,
  UserRound,
} from "lucide-react";

const items = [
  { id: "home", href: "/", label: "Home", icon: Home },
  { id: "discover", href: "/discover", label: "Discover", icon: Compass },
  { id: "bookings", href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { id: "messages", href: "/messages", label: "Messages", icon: MessageSquare },
  { id: "profile", href: "/workspace", label: "Profile", icon: UserRound },
] as const;

type ActiveItem =
  | (typeof items)[number]["id"]
  | "search"
  | "shop";

export function BottomNavigation({ active }: { active?: ActiveItem }) {
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
