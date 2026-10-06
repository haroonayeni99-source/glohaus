"use client";

import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Star,
} from "lucide-react";
import { useState } from "react";
import type { InAppNotification } from "@/modules/notifications/repository";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function NotificationIcon({ kind }: { kind: InAppNotification["kind"] }) {
  if (kind === "booking_reminder") return <CalendarClock size={16} aria-hidden />;
  if (kind === "appointment_completed") return <Star size={16} aria-hidden />;
  if (kind === "order_shipping_reminder") return <PackageOpen size={16} aria-hidden />;
  if (kind.startsWith("order_refund")) return <RotateCcw size={16} aria-hidden />;
  if (kind.startsWith("order_")) return <PackageCheck size={16} aria-hidden />;
  return <Bell size={16} aria-hidden />;
}

export function NotificationInbox({
  initialNotifications,
  professional = false,
}: {
  initialNotifications: InAppNotification[];
  professional?: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [updating, setUpdating] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState("");
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  async function markRead(id: string) {
    setUpdating(id);
    setUpdateError("");
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        setUpdateError("GLOHAUS could not update this notification. Please try again.");
        return;
      }
      setNotifications((items) =>
        items.map((item) =>
          item.id === id && !item.read_at ? { ...item, read_at: new Date() } : item,
        ),
      );
    } finally {
      setUpdating(null);
    }
  }
  async function markAllRead() {
    if (!unreadCount || updating) return;
    setUpdating("all");
    setUpdateError("");
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) return;
      const now = new Date();
      setNotifications((items) =>
        items.map((item) => (item.read_at ? item : { ...item, read_at: now })),
      );
    } finally {
      setUpdating(null);
    }
  }

  if (!notifications.length)
    return (
      <section className={professional ? "pro-empty-state pro-large-empty" : "catalog-empty"}>
        <Bell size={32} aria-hidden />
        <h2>No notifications yet.</h2>
        <p>Booking reminders, Shop orders and other account activity will appear here when they happen.</p>
        <Link href={professional ? "/professional/bookings" : "/explore"}>
          {professional ? "View appointments" : "Discover professionals"}
        </Link>
      </section>
    );
  return (
    <section className={professional ? "pro-notification-list" : "notification-list"} aria-label="Notifications">
      {updateError && <p className="form-error" role="alert">{updateError}</p>}
      {unreadCount > 0 && (
        <div className="notification-toolbar">
          <span>{unreadCount} unread</span>
          <button
            type="button"
            disabled={updating === "all"}
            onClick={() => void markAllRead()}
          >
            <CheckCheck size={16} aria-hidden />
            {updating === "all" ? "Updating…" : "Mark all as read"}
          </button>
        </div>
      )}
      {notifications.map((notification) => (
        <article key={notification.id} data-read={Boolean(notification.read_at)}>
          <Link href={notification.href} onClick={() => void markRead(notification.id)}>
            <span className="notification-icon"><NotificationIcon kind={notification.kind} /></span>
            <span>
              <strong>{notification.title}</strong>
              <small>{notification.body}</small>
              <time>{date(notification.created_at)}</time>
            </span>
          </Link>
          {!notification.read_at && (
            <button
              type="button"
              onClick={() => void markRead(notification.id)}
              disabled={updating === notification.id}
              aria-label={`Mark ${notification.title} as read`}
              title="Mark as read"
            >
              <CheckCheck size={17} aria-hidden />
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
