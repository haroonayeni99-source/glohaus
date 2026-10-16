"use client";
import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  mandatoryEmail,
  notificationLabels,
  type NotificationPreference,
} from "@/modules/notifications/preferences";
import type { PushDevice } from "@/modules/notifications/professional-repository";
type Settings = {
  preferences: NotificationPreference[];
  devices: PushDevice[];
};
function subscribeBrowserState(update: () => void) {
  window.addEventListener("focus", update);
  window.addEventListener("glohaus:push-permission", update);
  return () => {
    window.removeEventListener("focus", update);
    window.removeEventListener("glohaus:push-permission", update);
  };
}
function browserSnapshot() {
  const supported =
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return `${supported ? "supported" : "unsupported"}:${"Notification" in window ? Notification.permission : "default"}`;
}
function keyBytes(key: string) {
  const raw = atob(
    key.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (key.length % 4)) % 4),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function ProfessionalNotificationSettings({
  initial,
  pushConfigured,
  publicKey,
}: {
  initial: Settings;
  pushConfigured: boolean;
  publicKey: string | null;
}) {
  const [settings, setSettings] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const browserState = useSyncExternalStore(
    subscribeBrowserState,
    browserSnapshot,
    () => "unsupported:default",
  );
  const supported = browserState.startsWith("supported:");
  const permission = browserState.split(":")[1];
  async function refresh() {
    const response = await fetch("/api/v1/professional/notification-settings", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not reload settings. Try again.");
    setSettings(await response.json());
  }
  async function request(body: unknown) {
    const response = await fetch("/api/v1/professional/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        "Could not update this device. Check permission and try again.",
      );
    return response.json();
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(preference: NotificationPreference) {
    await run(async () => {
      const response = await fetch(
        "/api/v1/professional/notification-settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preference),
        },
      );
      if (!response.ok)
        throw new Error(
          "Could not save your notification choices. Please try again.",
        );
      await refresh();
      setMessage("Notification preferences saved.");
    });
  }
  async function enable() {
    await run(async () => {
      if (!supported || !publicKey)
        throw new Error("Push is not available in this browser yet.");
      const allowed = await Notification.requestPermission();
      window.dispatchEvent(new Event("glohaus:push-permission"));
      if (allowed !== "granted")
        throw new Error(
          "Notifications are blocked. Change this site's permission in your browser settings.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const oldKey = subscription.options.applicationServerKey;
        if (
          oldKey &&
          Array.from(new Uint8Array(oldKey)).join() !==
            Array.from(keyBytes(publicKey)).join()
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      const createdSubscription = !subscription;
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      try {
        const data = subscription.toJSON();
        const saved = await request({
          endpoint: data.endpoint,
          keys: data.keys,
          label: /iPhone|iPad/.test(navigator.userAgent)
            ? "iPhone / iPad"
            : /Android/.test(navigator.userAgent)
              ? "Android browser"
              : "Desktop browser",
        });
        try {
          localStorage.setItem("glohaus-push-device", saved.id);
        } catch {}
      } catch (error) {
        // A failed re-registration must not revoke a device that already works.
        // Clean up only a subscription created by this attempt, and preserve
        // the actionable save error if browser cleanup also fails.
        if (createdSubscription)
          await subscription.unsubscribe().catch(() => false);
        throw error;
      }
      await refresh();
      setMessage(
        "This device is enabled. Choose the Push alerts you want below, then send a test.",
      );
    });
  }
  async function deviceAction(device: PushDevice, action: "disable" | "test") {
    await run(async () => {
      await request({ id: device.id, action });
      if (action === "disable" && supported) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        let localId: string | null = null;
        try {
          localId = localStorage.getItem("glohaus-push-device");
        } catch {}
        if (subscription && localId === device.id) {
          await subscription.unsubscribe();
          try {
            localStorage.removeItem("glohaus-push-device");
          } catch {}
        }
      }
      await refresh();
      setMessage(
        action === "test"
          ? "Test queued. It will be sent on the next notification delivery run."
          : "Device disabled.",
      );
    });
  }
  return (
    <div className="pro-notification-settings">
      <p>
        Essential booking, order, cancellation, security and payment email
        notices stay enabled. Every critical transaction remains in your
        dashboard.
      </p>
      <section className="pro-settings-card" aria-labelledby="device-heading">
        <h2 id="device-heading">Phone and browser push</h2>
        <p>
          On iPhone or iPad, open GLOHAUS in Safari, choose Share → Add to Home
          Screen, then open the installed app to enable notifications. Supported
          Android and desktop browsers can enable push here.
        </p>
        {!pushConfigured && (
          <p role="status">
            Phone push is awaiting secure server configuration.
          </p>
        )}
        {!supported && (
          <p>
            Your browser does not currently support push here. Email and your
            dashboard remain available.
          </p>
        )}
        {permission === "denied" && (
          <p>
            Permission is blocked. Allow notifications in this site’s browser
            settings to try again.
          </p>
        )}
        <button
          type="button"
          disabled={
            busy || !supported || !pushConfigured || permission === "denied"
          }
          onClick={() => void enable()}
        >
          Enable this device
        </button>
        {settings.devices.map((device) => (
          <div className="pro-notification-device" key={device.id}>
            <span>
              <strong>{device.label}</strong>
              <small>
                {device.disabled_at ? "Disabled" : "Enabled"}
                {device.last_success_at
                  ? ` · Last accepted ${new Date(device.last_success_at).toLocaleDateString("en-GB")}`
                  : ""}
              </small>
            </span>
            {!device.disabled_at && (
              <span>
                <button
                  type="button"
                  disabled={busy || !pushConfigured}
                  onClick={() => void deviceAction(device, "test")}
                >
                  Send test
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deviceAction(device, "disable")}
                >
                  Disable device
                </button>
              </span>
            )}
          </div>
        ))}
      </section>
      <section className="pro-settings-card" aria-labelledby="alert-heading">
        <h2 id="alert-heading">Choose your alerts</h2>
        <div className="pro-notification-preference-heading" aria-hidden>
          <span>Notification</span>
          <span>Email</span>
          <span>Push</span>
        </div>
        {settings.preferences.map((preference) => (
          <div
            className="pro-notification-preference"
            key={preference.category}
          >
            <span>
              {notificationLabels[preference.category]}
              {mandatoryEmail.has(preference.category) && (
                <small>Essential email</small>
              )}
            </span>
            <label>
              <span className="sr-only">
                {notificationLabels[preference.category]} email
              </span>
              <input
                type="checkbox"
                checked={preference.email}
                disabled={busy || mandatoryEmail.has(preference.category)}
                onChange={(e) =>
                  void save({ ...preference, email: e.target.checked })
                }
              />
            </label>
            <label>
              <span className="sr-only">
                {notificationLabels[preference.category]} push
              </span>
              <input
                type="checkbox"
                checked={preference.push}
                disabled={busy}
                onChange={(e) =>
                  void save({ ...preference, push: e.target.checked })
                }
              />
            </label>
          </div>
        ))}
        <p>
          Promotional email uses your existing professional promotions consent.{" "}
          <Link href="/preferences">Manage all marketing preferences</Link>.
        </p>
      </section>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
