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
    const ids = sections.map(([, id]) => id);

    const updateActiveSection = () => {
      const marker = 145;
      const candidates = ids
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => Boolean(node))
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

      if (!candidates.length) return;

      let current = candidates[0].id;
      for (const section of candidates) {
        if (section.getBoundingClientRect().top <= marker) current = section.id;
        else break;
      }

      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8
      ) {
        current = candidates[candidates.length - 1].id;
      }

      setActiveId((previous) => (previous === current ? previous : current));
    };

    const initial = window.location.hash.replace("#", "");
    if (initial && ids.includes(initial)) {
      setActiveId(initial);
      requestAnimationFrame(() => {
        document.getElementById(initial)?.scrollIntoView({ block: "start" });
      });
    } else {
      updateActiveSection();
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateActiveSection();
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  useEffect(() => {
    const activeLink = document.querySelector<HTMLAnchorElement>(
      `.admin-navigation nav a[href="#${activeId}"]`,
    );
    activeLink?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  function activate(id: string) {
    setActiveId(id);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    }
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
              onClick={(event) => {
                event.preventDefault();
                activate(id);
              }}
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
