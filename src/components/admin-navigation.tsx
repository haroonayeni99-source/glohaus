"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CreditCard,
  FileWarning,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
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

function sectionOffset() {
  const mobile = window.matchMedia("(max-width: 880px)").matches;
  const header = document.querySelector(mobile ? ".admin-navigation" : ".owner-topbar");
  const offset = (header?.getBoundingClientRect().height ?? (mobile ? 160 : 76)) + 20;
  const workspace = document.querySelector<HTMLElement>(".admin-workspace");
  if (workspace?.style.getPropertyValue("--admin-section-offset") !== `${offset}px`) workspace?.style.setProperty("--admin-section-offset", `${offset}px`);
  return offset;
}

const coreSections = [
  ["Overview", "overview", LayoutDashboard],
  ["Settings", "settings", Settings],
  ["Categories", "categories", BookOpenCheck],
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
  ["Marketing", "marketing", MessageSquareWarning],
  ["Homepage Images", "homepage-media", Settings],
  ["Booking Fee", "booking-fee", CreditCard],
  ["Shop Fees", "shop-fees", CreditCard],
  ["Auth Accounts", "auth-accounts", UsersRound],
  ["Pro Commission", "professional-commission", CreditCard],
  ["Referrals", "referrals", UsersRound],
  ["Admins & Access", "staff", ShieldCheck],
  ["Backend Health", "backend-health", BarChart3],
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
            coreSections[0],
            ownerSections[0],
            ownerSections[1],
            ownerSections[2],
            coreSections[1],
            ownerSections[3],
            ownerSections[4],
            ownerSections[5],
            ownerSections[6],
            ownerSections[7],
            ownerSections[8],
            ...coreSections.slice(2),
            ownerSections[9],
            ownerSections[10],
            ownerSections[11],
            ownerSections[12],
            ownerSections[13],
          ]
        : [...coreSections],
    [owner],
  );
  const [activeId, setActiveId] = useState("overview");
  const [compact, setCompact] = useState(false);
  const activated = useRef<{ id: string; y: number } | null>(null);


  useEffect(() => {
    const ids: string[] = sections.map(([, id]) => id);

    const updateActiveSection = () => {
      // Nearby cards may share a row or be too close to the page bottom to
      // align at the marker. Keep an explicit selection until the user scrolls.
      if (activated.current && Math.abs(window.scrollY - activated.current.y) < 2) {
        setActiveId(activated.current.id);
        return;
      }
      activated.current = null;
      const marker = sectionOffset() + 29;
      // The dashboard groups cards differently from the navigation menu.
      // Compare actual document positions, never the menu's order.
      const positions = ids.flatMap(id => {
        const target = document.getElementById(id);
        return target ? [{ id, top: target.getBoundingClientRect().top }] : [];
      }).sort((a, b) => a.top - b.top);
      let current = positions[0]?.id ?? "overview";
      for (const section of positions) {
        if (section.top <= marker) current = section.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = positions.at(-1)?.id ?? current;
      }

      setActiveId((previous) => (previous === current ? previous : current));
    };

    const initial = window.location.hash.replace("#", "");
    if (initial && ids.includes(initial)) {
      requestAnimationFrame(() => {
        const target = document.getElementById(initial);
        if (target) {
          const top =
            window.scrollY + target.getBoundingClientRect().top - sectionOffset();
          window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          activated.current = { id: initial, y: window.scrollY };
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
    window.addEventListener("hashchange", onScroll);


    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", onScroll);

      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  function activate(id: string) {
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    const top = window.scrollY + target.getBoundingClientRect().top - sectionOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    activated.current = { id, y: window.scrollY };
    history.replaceState(history.state, "", `#${id}`);
  }

  return (
    <aside className={`admin-navigation${compact ? " is-compact" : ""}`} aria-label="Administration navigation">
      <button className="admin-navigation-collapse" type="button"
        aria-label={compact ? "Expand administration menu" : "Minimise administration menu"}
        aria-expanded={!compact} onClick={() => setCompact(value => !value)}>
        {compact ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
        <span>{compact ? "Expand menu" : "Minimise menu"}</span>
      </button>
      <Link className="admin-navigation-brand" href="#overview" onClick={(event) => { event.preventDefault(); activate("overview"); }}>
        <ShieldCheck size={20} aria-hidden />
        <span>GLOHAUS {owner ? "OWNER" : "ADMIN"}</span>
      </Link>
      <p className="admin-navigation-identity">
        {account.displayName}
        <small>{owner ? "Owner · Super Admin" : "Administrator"}</small>
      </p>
      <label className="admin-section-picker">
        Go to section
        <select value={activeId} onChange={event => activate(event.target.value)}>
          {sections.map(([label, id]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <nav id="admin-section-menu">
        {sections.map(([label, id, Icon]) => {
          const active = id === activeId;
          return (
            <a
              key={id}
              title={label}
              aria-label={label}
              href={`#${id}`}
              className={active ? "is-active" : undefined}
              aria-current={active ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                activate(id);
              }}
            >
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
      <div className="admin-navigation-bottom">
        <Link href="/">Return to GLOHAUS</Link>
        <Link href="/security" title="Account security">Security</Link>
        <AccountControls />
      </div>
    </aside>
  );
}
