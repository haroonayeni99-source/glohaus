"use client";

import { openAdminSection } from "@/components/admin-workspace-view";
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
import {
  adminTaskGroups,
  adminToolGuide,
  matchesAdminTool,
} from "@/components/admin-tool-guide";
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
  ["Website wording", "settings", Settings],
  ["Service Categories", "categories", BookOpenCheck],
  ["Product Categories", "product-categories", PackageCheck],
  ["Users", "users", UsersRound],
  ["Professionals", "professionals", BadgeCheck],
  ["Professional Policies", "professional-policies", BookOpenCheck],
  ["Inactive Professionals", "professional-activity", UsersRound],
  ["Verification & LIVE", "live-access", Radio],
  ["Bookings", "bookings", CalendarDays],
  ["Orders", "orders", PackageCheck],
  ["Reviews", "reviews", MessageSquareWarning],
  ["Safety reports", "reports", FileWarning],
  ["Support & Disputes", "support", MessageSquareWarning],
  ["Posts & Stories", "content", BookOpenCheck],
  ["Payment disputes", "payment-disputes", CreditCard],
  ["Refund appeals", "refund-appeals", CreditCard],
  ["Payments & Payouts", "payments", CreditCard],
  ["Analytics", "analytics", BarChart3],
  ["Arrival & communications", "arrival-management", CalendarDays],
  ["Notification delivery", "push-delivery-health", MessageSquareWarning],
] as const;

const ownerSections = [
  ["Website ON / OFF", "website-status", Globe2],
  ["Marketing", "marketing", MessageSquareWarning],
  ["Homepage Images", "homepage-media", Settings],
  ["Example profiles", "profile-examples", UsersRound],
  ["Booking Fee", "booking-fee", CreditCard],
  ["Shop Fees", "shop-fees", CreditCard],
  ["Sign-ups & sign-ins", "auth-accounts", UsersRound],
  ["Founding Programme Controls", "founding-programme", CreditCard],
  ["Commission & Pricing", "professional-commission", CreditCard],
  ["Customer Acquisition & Growth", "referrals", UsersRound],
  ["Admins & Access", "staff", ShieldCheck],
  ["Platform Health", "backend-health", BarChart3],
  ["Payment setup", "payment-readiness", CreditCard],
  ["Email setup", "email-readiness", ShieldCheck],
  ["Email Delivery", "email-delivery-health", MessageSquareWarning],
  ["Audit Log", "audit", BarChart3],
] as const;

const adminGroups = adminTaskGroups;

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
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "Start here",
  ]);
  function expandGroup(id: string) {
    const label = adminGroups.find((group) => group.ids.includes(id))?.label;
    if (label)
      setExpandedGroups((groups) =>
        groups.includes(label) ? groups : [...groups, label],
      );
  }
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
          expandGroup(initial);
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

    const onSelection = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setActiveId(id);
      expandGroup(id);
    };
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

  const visibleSections = sections.filter(([label, id]) =>
    matchesAdminTool(id, label, menuSearch),
  );

  function activate(id: string) {
    openAdminSection(id);
    const target = document.getElementById(id);
    if (!target) return;

    setActiveId(id);
    expandGroup(id);
    const top =
      window.scrollY + target.getBoundingClientRect().top - sectionOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    activated.current = { id, y: window.scrollY };
    history.replaceState(history.state, "", `#${id}`);
  }

  return (
    <aside
      className={`admin-navigation${compact ? " is-compact" : ""}${menuSearch.trim() ? " has-tool-search" : ""}`}
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
          {adminGroups
            .filter((group) =>
              sections.some(([, id]) => group.ids.includes(id)),
            )
            .map((group) => (
              <optgroup key={group.label} label={group.label}>
                {sections
                  .filter(([, id]) => group.ids.includes(id))
                  .map(([label, id]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
              </optgroup>
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
          placeholder="Try fees, complaints or photos"
        />
      </label>
      <nav id="admin-section-menu" aria-label="Management tools">
        {adminGroups.map((group, index) => {
          const tools = visibleSections.filter(([, id]) =>
            group.ids.includes(id),
          );
          if (!tools.length) return null;
          const expanded =
            compact ||
            !!menuSearch.trim() ||
            expandedGroups.includes(group.label);
          return (
            <div className="admin-tool-group" key={group.label}>
              <button
                type="button"
                className="admin-tool-group-toggle"
                aria-expanded={expanded}
                aria-controls={`admin-tools-${index}`}
                onClick={() =>
                  setExpandedGroups((groups) =>
                    groups.includes(group.label)
                      ? groups.filter((label) => label !== group.label)
                      : [...groups, group.label],
                  )
                }
              >
                <span>{group.label}</span>
                <span aria-hidden>{expanded ? "−" : "+"}</span>
              </button>
              <div
                id={`admin-tools-${index}`}
                className="admin-tool-group-links"
                hidden={!expanded}
              >
                {tools.map(([label, id, Icon]) => (
                  <a
                    key={id}
                    title={`${label}: ${adminToolGuide[id]?.purpose ?? ""}`}
                    aria-label={label}
                    href={`#${id}`}
                    className={id === activeId ? "is-active" : undefined}
                    aria-current={id === activeId ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      activate(id);
                    }}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        {!visibleSections.length && (
          <p role="status">
            No tools match. Try a shorter search or clear it to see all
            sections.
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
