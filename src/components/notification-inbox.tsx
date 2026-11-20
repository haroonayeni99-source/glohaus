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
import { useEffect, useRef, useState } from "react";
import { LoadingDots } from "./loading-dots";
import type { InAppNotification } from "@/modules/notifications/repository";

function date(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function NotificationIcon({ kind }: { kind: InAppNotification["kind"] }) {
  if (kind === "booking_reminder")
    return <CalendarClock size={16} aria-hidden />;
  if (kind === "appointment_completed") return <Star size={16} aria-hidden />;
  if (kind === "order_shipping_reminder")
    return <PackageOpen size={16} aria-hidden />;
  if (kind.startsWith("order_refund"))
    return <RotateCcw size={16} aria-hidden />;
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
  const saving = useRef(false);
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  useEffect(() => {
    const receive = (event: Event) =>
      setNotifications((event as CustomEvent).detail.notifications);
    window.addEventListener("glohaus:notifications", receive);
    let source: EventSource | undefined;
    if (!professional) {
      source = new EventSource("/api/v1/notifications/stream");
      source.addEventListener("notifications", (event) => {
        try {
          setNotifications(
            JSON.parse((event as MessageEvent).data).notifications,
          );
        } catch {}
      });
    }
    const identityChange = (event: Event) => {
      if (!(event as CustomEvent).detail.signedIn) {
        source?.close();
        setNotifications([]);
      }
    };
    window.addEventListener("glohaus:identity-change", identityChange);
    return () => {
      window.removeEventListener("glohaus:identity-change", identityChange);
      window.removeEventListener("glohaus:notifications", receive);
      source?.close();
    };
  }, [professional]);
  async function markRead(id: string) {
    if (saving.current || notifications.find(item => item.id === id)?.read_at) return;
    saving.current = true;
    setUpdating(id);
    setUpdateError("");
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setUpdateError(
          "GLOHAUS could not update this notification. Please try again.",
        );
        return;
      }
      setNotifications((items) =>
        items.map((item) =>
          item.id === id && !item.read_at
            ? { ...item, read_at: new Date() }
            : item,
        ),
      );
    } catch {
      setUpdateError(
        "GLOHAUS could not update your notifications. Please try again.",
      );
    } finally {
      saving.current = false;
      setUpdating(null);
    }
  }
  async function markAllRead() {
    if (!unreadCount || saving.current) return;
    saving.current = true;
    const submitted = new Set(notifications.filter(item => !item.read_at).map(item => item.id));
    setUpdating("all");
    setUpdateError("");
    try {
      const response = await fetch("/api/v1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setUpdateError(
          "GLOHAUS could not update your notifications. Please try again.",
        );
        return;
      }
      const now = new Date();
      setNotifications((items) =>
        items.map((item) => (item.read_at || !submitted.has(item.id) ? item : { ...item, read_at: now })),
      );
    } catch {
      setUpdateError(
        "GLOHAUS could not update your notifications. Please try again.",
      );
    } finally {
      saving.current = false;
      setUpdating(null);
    }
  }

  if (!notifications.length)
    return (
      <section
        className={
          professional ? "pro-empty-state pro-large-empty" : "catalog-empty"
        }
      >
        <Bell size={32} aria-hidden />
        <h2>No notifications yet.</h2>
        <p>
          Booking reminders, Shop orders and other account activity will appear
          here when they happen.
        </p>
        <Link href={professional ? "/professional/bookings" : "/explore"}>
          {professional ? "View appointments" : "Discover professionals"}
        </Link>
      </section>
    );
  return (
    <section
      className={professional ? "pro-notification-list" : "notification-list"}
      aria-label="Notifications"
    >
      {updateError && (
        <p className="form-error" role="alert">
          {updateError}
        </p>
      )}
      {unreadCount > 0 && (
        <div className="notification-toolbar">
          <span>{unreadCount} unread</span>
          <button
            type="button"
            disabled={Boolean(updating)}
            onClick={() => void markAllRead()}
          >
            <CheckCheck size={16} aria-hidden />
            Mark all as read<LoadingDots busy={updating === "all"} />
          </button>
        </div>
      )}
      {notifications.map((notification) => (
        <article
          key={notification.id}
          data-read={Boolean(notification.read_at)}
        >
          <Link
            href={notification.href}
            onClick={() => void markRead(notification.id)}
          >
            <span className="notification-icon">
              <NotificationIcon kind={notification.kind} />
            </span>
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
              disabled={Boolean(updating)}
              aria-label={`Mark ${notification.title} as read`}
              title="Mark as read"
            >
              <CheckCheck size={17} aria-hidden /><LoadingDots busy={updating === notification.id} />
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
