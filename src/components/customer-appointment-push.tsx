"use client";
import { useEffect, useRef, useState } from "react";

export function CustomerAppointmentPush({
  bookingId,
  publicKey,
}: {
  bookingId: string;
  publicKey: string | null;
}) {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const endpoint = `/api/v1/bookings/${bookingId}/journey-push`;
  async function register() {
    setBusy(true);
    setMessage("");
    try {
      if (
        !publicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "Push is unavailable here. On iPhone, use an installed Home Screen web app where supported. In-app and email remain available.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Notification permission was not granted. You can continue without push.",
        );
      if (!mounted.current) return;
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const raw = atob(
        publicKey.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (publicKey.length % 4)) % 4),
      );
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      if (!mounted.current) return;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok)
        throw new Error("Could not register this device. Try again.");
      const saved = await response.json();
      if (mounted.current) {
        setSubscriptionId(saved.subscriptionId);
        setMessage(
          "This device is registered. You can now request a test; registration alone is not proof of delivery.",
        );
      }
    } catch (e) {
      if (mounted.current)
        setMessage(
          e instanceof Error ? e.message : "Could not register this device.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", subscriptionId }),
      });
      if (!r.ok) throw new Error();
      if (mounted.current)
        setMessage(
          "Test queued for this device. Check the notification and open it, then review the device-reported display and click in Owner/Admin. Queued is not proof of delivery.",
        );
    } catch {
      if (mounted.current)
        setMessage(
          "Could not queue the device test. Wait a minute and try again.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details className="appointment-arrival">
      <summary>Appointment phone notifications</summary>
      <p>
        Push notifications are optional. Registering this device does not enable
        location access, journey sharing or travel reminders. On supported
        iPhones, add GLOHAUS to your Home Screen first.
      </p>
      <button type="button" disabled={busy} onClick={() => void register()}>
        Enable phone notifications on this device
      </button>
      {subscriptionId && (
        <button type="button" disabled={busy} onClick={() => void test()}>
          Send a test notification to this device
        </button>
      )}
      <p>
        <small>
          A device-reported display or click does not prove that appointment
          instructions were understood. Those instructions require their own
          acknowledgement. If an updated service worker is waiting, close other
          GLOHAUS tabs and reopen the installed app before repeating the test.
        </small>
      </p>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
