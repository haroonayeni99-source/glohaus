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
  Globe2,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AccountControls } from "@/components/account-controls";
import type { Account } from "@/modules/accounts/domain";

const coreSections = [
  ["Overview", "overview", LayoutDashboard],
  ["Settings", "settings", Settings],
  ["App Users", "users", UsersRound],
  ["Professionals", "professionals", BadgeCheck],
  ["LIVE", "live-access", Radio],
  ["Bookings", "bookings", CalendarDays],
  ["Orders", "orders", PackageCheck],
  ["Reviews", "reviews", MessageSquareWarning],
  ["Reports", "reports", FileWarning],
  ["Content", "content", BookOpenCheck],
  ["Payments", "payments", CreditCard],
  ["Analytics", "analytics", BarChart3],
] as const;

const ownerSections = [
  ["Website Status", "website-status", Globe2],
  ["Booking Fee", "booking-fee", CreditCard],
  ["Shop Fees", "shop-fees", CreditCard],
  ["Auth Accounts", "auth-accounts", UsersRound],
  ["Pro Commission", "professional-commission", CreditCard],
  ["Referrals", "referrals", UsersRound],
  ["Admins & Access", "staff", ShieldCheck],
  ["Payment Readiness", "payment-readiness", CreditCard],
  ["Email Readiness", "email-readiness", ShieldCheck],
  ["Email Delivery", "email-delivery-health", MessageSquareWarning],
  ["Audit Log", "audit", BarChart3],
] as const;

export function AdminNavigation({ account }: { account: Account }) {
  const owner = account.roles.includes("owner");
  const sections = useMemo(
    () =>
      owner
        ? [
            ownerSections[0],
            coreSections[0],
            coreSections[1],
            ownerSections[1],
            ownerSections[2],
            ownerSections[3],
            ownerSections[4],
            ownerSections[5],
            ownerSections[6],
            ...coreSections.slice(2),
            ownerSections[7],
            ownerSections[8],
            ownerSections[9],
            ownerSections[10],
          ]
        : [...coreSections],
    [owner],
  );
  const [activeId, setActiveId] = useState("overview");

  useEffect(() => {
    const ids: string[] = sections.map(([, id]) => id);

    const updateActiveSection = () => {
      const marker = 125;
      let current = ids[0] ?? "overview";

      for (const id of ids) {
        const section = document.getElementById(id);
        if (!section) continue;
        const top = section.getBoundingClientRect().top;
        if (top <= marker) current = id;
        else break;
      }

      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        const lastExisting = [...ids]
          .reverse()
          .find((id) => document.getElementById(id));
        if (lastExisting) current = lastExisting;
      }

      setActiveId((previous) => (previous === current ? previous : current));
    };

    const initial = window.location.hash.replace("#", "");
    if (initial && ids.includes(initial)) {
      requestAnimationFrame(() => {
        const target = document.getElementById(initial);
        if (target) {
          const top =
            window.scrollY + target.getBoundingClientRect().top - 96;
          window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          setActiveId(initial);
        }
      });
    } else {
      updateActiveSection();
    }

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        updateActiveSection();
        frame = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  function activate(id: string) {
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    const top = window.scrollY + target.getBoundingClientRect().top - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    history.replaceState(null, "", `#${id}`);
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
        <Link href="/">Return to GLOHAUS</Link>
        <AccountControls />
      </div>
    </aside>
  );
}
