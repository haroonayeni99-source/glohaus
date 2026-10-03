"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  ["Auth Accounts", "auth-accounts", UsersRound],
  ["Pro Commission", "professional-commission", CreditCard],
  ["Booking Fee", "booking-fee", CreditCard],
  ["Referrals", "referrals", UsersRound],
  ["Shop Fees", "shop-fees", CreditCard],
  ["Staff & Admins", "staff", ShieldCheck],
  ["Audit Log", "audit", BarChart3],
] as const;

export function AdminNavigation({ account }: { account: Account }) {
  const owner = account.roles.includes("owner");
  const sections = useMemo(
    () => (owner ? [...coreSections, ...ownerSections] : [...coreSections]),
    [owner],
  );
  const [activeId, setActiveId] = useState("overview");

  useEffect(() => {
    const initial = window.location.hash.replace("#", "");
    if (initial && sections.some(([, id]) => id === initial)) setActiveId(initial);

    const targets = sections
      .map(([, id]) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const aTop = Math.abs(a.boundingClientRect.top - 120);
            const bTop = Math.abs(b.boundingClientRect.top - 120);
            return aTop - bTop;
          });
        const next = visible[0]?.target.id;
        if (next) {
          setActiveId(next);
          history.replaceState(null, "", `#${next}`);
        }
      },
      {
        root: null,
        rootMargin: "-90px 0px -62% 0px",
        threshold: [0, 0.01, 0.15],
      },
    );

    targets.forEach((target) => observer.observe(target));

    const onScroll = () => {
      if (window.scrollY < 80) setActiveId("overview");
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections]);

  function activate(id: string) {
    setActiveId(id);
  }

  return (
    <aside className="admin-navigation" aria-label="Administration navigation">
      <Link className="admin-navigation-brand" href="/admin" onClick={() => activate("overview")}>
        <ShieldCheck size={20} aria-hidden />
        <span>GLOHAUS {owner ? "OWNER" : "ADMIN"}</span>
      </Link>
      <p className="admin-navigation-identity">
        {account.displayName}
        <small>{owner ? "Owner · Super Admin" : "Administrator"}</small>
      </p>
      <nav>
        {sections.map(([label, id, Icon]) => {
          const active = id === activeId;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={active ? "is-active" : undefined}
              aria-current={active ? "location" : undefined}
              onClick={() => activate(id)}
            >
              <Icon size={16} aria-hidden />
              {label}
            </a>
          );
        })}
      </nav>
      <div className="admin-navigation-bottom">
        <Link href="/workspace">Return to GLOHAUS</Link>
        <AccountControls />
      </div>
    </aside>
  );
}
