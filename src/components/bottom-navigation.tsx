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
  { id: "discover", href: "/share", label: "Share", icon: Compass },
  { id: "bookings", href: "/account/bookings", label: "Bookings", icon: CalendarDays },
  { id: "messages", href: "/messages", label: "Messages", icon: MessageSquare },
  { id: "profile", href: "/workspace", label: "Profile", icon: UserRound },
] as const;

type ActiveItem =
  | (typeof items)[number]["id"]
  | "search"
  | "shop";

const privateItems = new Set(["bookings", "messages", "profile"]);

export function BottomNavigation({
  active,
  signedIn = false,
}: {
  active?: ActiveItem;
  signedIn?: boolean;
}) {
  return (
    <nav className="glohaus-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const href =
          !signedIn && privateItems.has(item.id)
            ? `/sign-in?returnTo=${encodeURIComponent(item.href)}`
            : item.href;
        return (
          <Link
            key={item.id}
            href={href}
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
