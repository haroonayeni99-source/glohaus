"use client";

import { openAdminSection } from "@/components/admin-workspace-view";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  const header = document.querySelector(
    mobile ? ".admin-navigation" : ".owner-topbar",
  );
  const offset =
    (header?.getBoundingClientRect().height ?? (mobile ? 160 : 76)) + 20;
  const workspace = document.querySelector<HTMLElement>(".admin-workspace");
  if (
    workspace?.style.getPropertyValue("--admin-section-offset") !==
    `${offset}px`
  )
    workspace?.style.setProperty("--admin-section-offset", `${offset}px`);
  return offset;
}

const coreSections = [
  ["Overview", "overview", LayoutDashboard],
  ["Settings", "settings", Settings],
  ["Categories", "categories", BookOpenCheck],
  ["Users", "users", UsersRound],
  ["Professionals", "professionals", BadgeCheck],
  ["Verification & LIVE", "live-access", Radio],
  ["Bookings", "bookings", CalendarDays],
  ["Orders", "orders", PackageCheck],
  ["Reviews", "reviews", MessageSquareWarning],
  ["Reports", "reports", FileWarning],
  ["Content", "content", BookOpenCheck],
  ["Disputes", "payment-disputes", CreditCard],
  ["Refund appeals", "refund-appeals", CreditCard],
  ["Payments", "payments", CreditCard],
  ["Analytics", "analytics", BarChart3],
] as const;

const ownerSections = [
  ["Website ON / OFF", "website-status", Globe2],
  ["Marketing", "marketing", MessageSquareWarning],
  ["Homepage Images", "homepage-media", Settings],
  ["Booking Fee", "booking-fee", CreditCard],
  ["Shop Fees", "shop-fees", CreditCard],
  ["Sign-ups & sign-ins", "auth-accounts", UsersRound],
  ["Professional commission", "professional-commission", CreditCard],
  ["Referrals", "referrals", UsersRound],
  ["Admins & Access", "staff", ShieldCheck],
  ["System health", "backend-health", BarChart3],
  ["Payment setup", "payment-readiness", CreditCard],
  ["Email setup", "email-readiness", ShieldCheck],
  ["Email Delivery", "email-delivery-health", MessageSquareWarning],
  ["Audit Log", "audit", BarChart3],
] as const;

const adminGroups = [
  { label: "Workspace", ids: ["overview", "website-status", "settings"] },
  {
    label: "People & access",
    ids: ["users", "auth-accounts", "professionals", "live-access", "staff"],
  },
  {
    label: "Marketplace & support",
    ids: [
      "categories",
      "bookings",
      "orders",
      "reviews",
      "reports",
      "payment-disputes",
      "refund-appeals",
    ],
  },
  {
    label: "Money & analytics",
    ids: [
      "payments",
      "booking-fee",
      "shop-fees",
      "professional-commission",
      "analytics",
    ],
  },
  {
    label: "Content & growth",
    ids: ["homepage-media", "content", "marketing", "referrals"],
  },
  {
    label: "Operations",
    ids: [
      "audit",
      "backend-health",
      "payment-readiness",
      "email-readiness",
      "email-delivery-health",
    ],
  },
];

export function AdminNavigation({ account }: { account: Account }) {
  const owner = account.roles.includes("owner");
  const sections = useMemo(() => {
    const available = owner
      ? [...coreSections, ...ownerSections]
      : [...coreSections];
    return adminGroups.flatMap((group) =>
      group.ids.flatMap((id) =>
        available.filter(([, sectionId]) => sectionId === id),
      ),
    );
  }, [owner]);
  const [activeId, setActiveId] = useState("overview");
  const [compact, setCompact] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const activated = useRef<{ id: string; y: number } | null>(null);

  useEffect(() => {
    const ids: string[] = sections.map(([, id]) => id);

    const updateActiveSection = () => {
      // Nearby cards may share a row or be too close to the page bottom to
      // align at the marker. Keep an explicit selection until the user scrolls.
      if (
        activated.current &&
        Math.abs(window.scrollY - activated.current.y) < 2
      ) {
        setActiveId(activated.current.id);
        return;
      }
      activated.current = null;
      const marker = sectionOffset() + 29;
      // The dashboard groups cards differently from the navigation menu.
      // Compare actual document positions, never the menu's order.
      const positions = ids
        .flatMap((id) => {
          const target = document.getElementById(id);
          return target && !target.closest("[hidden]")
            ? [{ id, top: target.getBoundingClientRect().top }]
            : [];
        })
        .sort((a, b) => a.top - b.top);
      let current = positions[0]?.id ?? "overview";
      for (const section of positions) {
        if (section.top <= marker) current = section.id;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
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
            window.scrollY +
            target.getBoundingClientRect().top -
            sectionOffset();
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

    const onSelection = (event: Event) =>
      setActiveId((event as CustomEvent<string>).detail);
    window.addEventListener("glohaus:admin-section", onSelection);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", onScroll);

    return () => {
      window.removeEventListener("glohaus:admin-section", onSelection);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", onScroll);

      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  const visibleSections = sections.filter(([label]) =>
    label.toLowerCase().includes(menuSearch.trim().toLowerCase()),
  );

  function activate(id: string) {
    openAdminSection(id);
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    const top =
      window.scrollY + target.getBoundingClientRect().top - sectionOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    activated.current = { id, y: window.scrollY };
    history.replaceState(history.state, "", `#${id}`);
  }

  return (
    <aside
      className={`admin-navigation${compact ? " is-compact" : ""}`}
      aria-label="Administration navigation"
    >
      <button
        className="admin-navigation-collapse"
        type="button"
        aria-label={
          compact
            ? "Expand administration menu"
            : "Minimise administration menu"
        }
        aria-expanded={!compact}
        onClick={() => setCompact((value) => !value)}
      >
        {compact ? (
          <PanelLeftOpen size={18} aria-hidden />
        ) : (
          <PanelLeftClose size={18} aria-hidden />
        )}
        <span>{compact ? "Expand menu" : "Minimise menu"}</span>
      </button>
      <Link
        className="admin-navigation-brand"
        href="#overview"
        onClick={(event) => {
          event.preventDefault();
          activate("overview");
        }}
      >
        <ShieldCheck size={20} aria-hidden />
        <span>GLOHAUS {owner ? "OWNER" : "ADMIN"}</span>
      </Link>
      <p className="admin-navigation-identity">
        {account.displayName}
        <small>{owner ? "Owner · Super Admin" : "Administrator"}</small>
      </p>
      <label className="admin-section-picker">
        Go to section
        <select
          aria-label="Go to section"
          value={activeId}
          onChange={(event) => activate(event.target.value)}
        >
          {sections.map(([label, id]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-menu-search">
        Find a tool
        <input
          aria-label="Find a tool"
          type="search"
          value={menuSearch}
          onChange={(event) => setMenuSearch(event.target.value)}
          placeholder="Users, images, verification…"
        />
      </label>
      <nav id="admin-section-menu">
        {visibleSections.map(([label, id, Icon], index) => {
          const group = adminGroups.find((group) =>
            group.ids.includes(id),
          )?.label;
          const previousGroup = index
            ? adminGroups.find((group) =>
                group.ids.includes(visibleSections[index - 1][1]),
              )?.label
            : null;
          const active = id === activeId;
          return (
            <Fragment key={id}>
              {group !== previousGroup && (
                <p className="admin-menu-group">{group}</p>
              )}
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
            </Fragment>
          );
        })}
        {!sections.some(([label]) =>
          label.toLowerCase().includes(menuSearch.trim().toLowerCase()),
        ) && (
          <p role="status">
            No tools match. Clear the search to see all sections.
          </p>
        )}
      </nav>
      <div className="admin-navigation-bottom">
        <Link href="/">Return to GLOHAUS</Link>
        <Link href="/security" title="Account security">
          Security
        </Link>
        <AccountControls />
      </div>
    </aside>
  );
}
