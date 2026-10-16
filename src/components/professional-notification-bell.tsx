"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
export function ProfessionalNotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let enabled = true;
    const receive = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setUnread(data.unread);
        window.dispatchEvent(
          new CustomEvent("glohaus:notifications", { detail: data }),
        );
      } catch {}
    };
    const connect = () => {
      if (stopped || !enabled) return;
      source?.close();
      source = new EventSource("/api/v1/notifications/stream");
      source.addEventListener("notifications", receive);
      source.addEventListener("unavailable", () => {
        source?.close();
        retry = setTimeout(connect, 10000);
      });
    };
    const identityChange = (event: Event) => {
      source?.close();
      if (retry) clearTimeout(retry);
      enabled = Boolean((event as CustomEvent).detail.signedIn);
      setUnread(0);
      if ((event as CustomEvent).detail.signedIn) connect();
    };
    connect();
    window.addEventListener("glohaus:identity-change", identityChange);
    return () => {
      stopped = true;
      source?.close();
      if (retry) clearTimeout(retry);
      window.removeEventListener("glohaus:identity-change", identityChange);
    };
  }, []);
  return (
    <Link
      href="/notifications?view=professional"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell size={14} aria-hidden />
      Notifications
      {unread > 0 && (
        <span aria-live="polite" className="pro-notification-badge">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
