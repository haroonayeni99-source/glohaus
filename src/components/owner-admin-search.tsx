"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

type SearchItem = {
  key: string;
  label: string;
  detail: string;
  targetId: string;
};

const staticItems: SearchItem[] = [
    ["website", "Website Status", "Public access and maintenance", "website-status"],
    ["homepage", "Homepage images", "Change desktop and mobile photos", "homepage-media"],
    ["marketing", "Marketing", "Campaigns and feature feedback", "marketing"],
    ["settings", "Platform labels", "Community names", "settings"],
    ["categories", "Categories", "Discovery categories", "categories"],
    ["shop-fees", "Shop Fees", "Marketplace commission", "shop-fees"],
    ["backend", "Backend Health", "Jobs and queues", "backend-health"],
    ["payment-readiness", "Payment Readiness", "Payment configuration", "payment-readiness"],
    ["email-readiness", "Email Readiness", "Email configuration", "email-readiness"],
    ["email-health", "Email Delivery", "Delivery outcomes", "email-delivery-health"],
    ["disputes", "Payment disputes", "Booking dispute responses", "payment-disputes"],
    ["overview", "Overview", "Owner dashboard", "overview"],
    ["users", "App Users", "Manage accounts, restrictions and deletion", "users"],
    ["professionals", "Professionals", "Professional account management", "professionals"],
    ["bookings", "Bookings", "Booking overview", "bookings"],
    ["orders", "Orders", "Shop order oversight", "orders"],
    ["payments", "Payments", "Finance and payouts", "payments"],
    ["analytics", "Analytics", "Platform analytics", "analytics"],
    ["live", "LIVE", "Verification and LIVE access", "live-access"],
    ["content", "Content", "Content moderation", "content"],
    ["reports", "Reports", "Safety reports", "reports"],
    ["reviews", "Reviews", "Review moderation", "reviews"],
    ["auth", "Auth Accounts", "Supabase authentication accounts", "auth-accounts"],
    ["commission", "Pro Commission", "Professional commission controls", "professional-commission"],
    ["fee", "Booking Fee", "Customer booking fee", "booking-fee"],
    ["referrals", "Referrals", "Professional referral leaderboard", "referrals"],
    ["staff", "Staff & Admins", "Delegated access controls", "staff"],
    ["audit", "Audit Log", "Owner action history", "audit"],
  ].map(([key,label,detail,targetId]) => ({ key,label,detail,targetId }));

export function OwnerAdminSearch({
  users,
  professionals,
  bookings,
}: {
  users: { id: string; display_name: string; email: string; roles: string[] }[];
  professionals: { id: string; business_name: string }[];
  bookings: { id: string; service_name: string; professional_name: string; customer_name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);



  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const dynamic: SearchItem[] = [
      ...users.map((user) => ({
        key: `user-${user.id}`,
        label: user.display_name,
        detail: `${user.email} · ${user.roles.join(", ") || "user"}`,
        targetId: `user-${user.id}`,
      })),
      ...professionals.map((pro) => ({
        key: `pro-${pro.id}`,
        label: pro.business_name,
        detail: "Professional profile",
        targetId: `professional-${pro.id}`,
      })),
      ...bookings.map((booking) => ({
        key: `booking-${booking.id}`,
        label: booking.service_name,
        detail: `${booking.customer_name} · ${booking.professional_name}`,
        targetId: `booking-${booking.id}`,
      })),
    ];

    return [...staticItems, ...dynamic]
      .filter((item) =>
        `${item.label} ${item.detail}`.toLowerCase().includes(q),
      )
      .filter(item => typeof document !== "undefined" && document.getElementById(item.targetId))
      .slice(0, 8);
  }, [bookings, professionals, query, users]);

  function go(targetId: string) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    history.replaceState(history.state, "", `#${targetId}`);
    target.classList.add("owner-search-hit");
    window.setTimeout(() => target.classList.remove("owner-search-hit"), 1400);
    setOpen(false);
  }

  return (
    <div className="owner-admin-search">
      <div className="owner-search-shortcut">
        <Search size={17} aria-hidden />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              go(results[0].targetId);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search users, professionals, bookings…"
          aria-label="Search Owner controls"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="owner-search-results" role="listbox">
          {results.map((item) => (
            <button key={item.key} type="button" onClick={() => go(item.targetId)}>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
          {!results.length && <p>No matching Owner/Admin item found.</p>}
        </div>
      )}
    </div>
  );
}
