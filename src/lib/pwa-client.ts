"use client";

// Installation is browser-controlled. This store never requests notification or
// location permission; those remain separate, explicit actions in settings.
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let pendingInstall: InstallEvent | null = null;
let dismissedUntil = 0;
let installedHere = false;
const subscribers = new Set<() => void>();
let stopInstallListeners: (() => void) | undefined;
const notify = () => subscribers.forEach((update) => update());
const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export function pushBrowserState() {
  const installFirst = isAppleMobile() && !isStandalone();
  const supported =
    !installFirst &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return `${supported ? "supported" : installFirst ? "install-first" : "unsupported"}:${"Notification" in window ? Notification.permission : "default"}`;
}
export function pwaSnapshot() {
  let until = dismissedUntil;
  try {
    until = Math.max(
      until,
      Number(localStorage.getItem("glohaus-install-dismissed-until")) || 0,
    );
  } catch {}
  return JSON.stringify({
    apple: isAppleMobile(),
    android: /Android/.test(navigator.userAgent),
    standalone: isStandalone(),
    installed: installedHere,
    dismissed: until > Date.now(),
    prompt: Boolean(pendingInstall),
    secure: window.isSecureContext,
    online: navigator.onLine,
  });
}
export const pwaServerSnapshot = () => "";
export function subscribePwa(update: () => void) {
  subscribers.add(update);
  const install = (event: Event) => {
    event.preventDefault();
    pendingInstall = event as InstallEvent;
    notify();
  };
  const installed = () => {
    installedHere = true;
    pendingInstall = null;
    dismissInstall();
  };
  // Only one listener owns the single-use browser install event.
  const media = window.matchMedia("(display-mode: standalone)");
  if (subscribers.size === 1) {
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", installed);
    stopInstallListeners = () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", installed);
    };
  }
  window.addEventListener("storage", update);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  window.addEventListener("focus", update);
  window.addEventListener("glohaus:push-permission", update);
  media.addEventListener("change", update);
  return () => {
    subscribers.delete(update);
    if (!subscribers.size) {
      stopInstallListeners?.();
      stopInstallListeners = undefined;
    }
    window.removeEventListener("storage", update);
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
    window.removeEventListener("focus", update);
    window.removeEventListener("glohaus:push-permission", update);
    media.removeEventListener("change", update);
  };
}
export function dismissInstall() {
  dismissedUntil = Date.now() + 90 * 24 * 60 * 60 * 1000;
  try {
    localStorage.setItem(
      "glohaus-install-dismissed-until",
      String(dismissedUntil),
    );
  } catch {}
  notify();
}
export async function promptInstall() {
  const event = pendingInstall;
  if (!event) return "unavailable";
  pendingInstall = null;
  notify();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "dismissed") dismissInstall();
    return outcome;
  } catch {
    return "unavailable";
  }
}
export function registerPwaWorker() {
  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}
