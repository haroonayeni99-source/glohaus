"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import type { InAppNotification } from "@/modules/notifications/repository";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
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
  async function markRead(id: string) {
    setUpdating(id);
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      setNotifications((items) =>
        items.map((item) =>
          item.id === id && !item.read_at ? { ...item, read_at: new Date() } : item,
        ),
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
        <p>Booking updates will appear here when they happen.</p>
        <Link href={professional ? "/professional/bookings" : "/explore"}>
          {professional ? "View appointments" : "Discover professionals"}
        </Link>
      </section>
    );
  return (
    <section className={professional ? "pro-notification-list" : "notification-list"} aria-label="Notifications">
      {notifications.map((notification) => (
        <article key={notification.id} data-read={Boolean(notification.read_at)}>
          <Link href={notification.href} onClick={() => void markRead(notification.id)}>
            <span className="notification-icon"><Bell size={16} aria-hidden /></span>
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
