"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  dismissInstall,
  promptInstall,
  pwaServerSnapshot,
  pwaSnapshot,
  registerPwaWorker,
  subscribePwa,
} from "@/lib/pwa-client";

export function InstallButton() {
  const snapshot = useSyncExternalStore(
    subscribePwa,
    pwaSnapshot,
    pwaServerSnapshot,
  );
  const state = snapshot ? JSON.parse(snapshot) : null;
  const [message, setMessage] = useState("");
  if (state?.standalone || state?.installed)
    return <p role="status">You’re using GLOHAUS as an app on this device.</p>;
  return (
    <div>
      {state?.prompt && (
        <button
          type="button"
          className="button"
          onClick={async () => {
            const outcome = await promptInstall();
            setMessage(
              outcome === "accepted"
                ? "Installation accepted. Follow your browser’s instructions, then open GLOHAUS from your Home Screen or app list."
                : outcome === "dismissed"
                  ? "Installation dismissed. You can install later from your browser menu."
                  : "Use the manual instructions below to install from your browser menu.",
            );
          }}
        >
          Install GLOHAUS
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function PwaShell() {
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(
    subscribePwa,
    pwaSnapshot,
    pwaServerSnapshot,
  );
  const state = snapshot ? JSON.parse(snapshot) : null;
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updateError, setUpdateError] = useState("");
  const reloading = useRef(false);
  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const cleanups: Array<() => void> = [];
    const reload = () => {
      if (reloading.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    const checkWaiting = () => {
      if (active) setWaiting(registration?.waiting || null);
    };
    const watchInstall = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", checkWaiting);
      cleanups.push(() =>
        worker.removeEventListener("statechange", checkWaiting),
      );
    };
    const checkUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void registration?.update().catch(() => {});
    };
    void registerPwaWorker()
      .then((value) => {
        if (!active) return;
        registration = value;
        checkWaiting();
        watchInstall();
        registration.addEventListener("updatefound", watchInstall);
        document.addEventListener("visibilitychange", checkUpdate);
      })
      .catch(() => {}); // Installation guidance and the website still work.
    return () => {
      active = false;
      registration?.removeEventListener("updatefound", watchInstall);
      document.removeEventListener("visibilitychange", checkUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  const safeEntry = ["/", "/account", "/professional"].includes(pathname);
  const offer =
    safeEntry &&
    state?.secure &&
    !state.standalone &&
    !state.installed &&
    !state.dismissed &&
    (state.apple || state.android);
  // Never place update/install controls over checkout, authentication or uploads.
  const showUpdate = waiting && safeEntry;
  return (
    <>
      {state && !state.online && (
        <div className="pwa-connection" role="status">
          You’re offline. Bookings, payments, messages and journey updates need
          an internet connection.
        </div>
      )}
      {(offer || showUpdate) && (
        <aside
          className="pwa-notice"
          aria-label={showUpdate ? "GLOHAUS update" : "Install GLOHAUS"}
        >
          {showUpdate ? (
            <>
              <strong>A GLOHAUS update is ready</strong>
              <p>Finish any work in your open GLOHAUS tabs before reloading.</p>
              <button
                type="button"
                onClick={() => {
                  if (!navigator.onLine) {
                    setUpdateError("Reconnect before updating.");
                    return;
                  }
                  if (
                    !window.confirm(
                      "Reload GLOHAUS now? Unsaved work in open GLOHAUS tabs may be lost.",
                    )
                  )
                    return;
                  reloading.current = true;
                  waiting.postMessage({ type: "GLOHAUS_ACTIVATE_UPDATE" });
                }}
              >
                Reload to update
              </button>
              <button type="button" onClick={() => setWaiting(null)}>
                Later
              </button>
              {updateError && <p role="status">{updateError}</p>}
            </>
          ) : (
            <>
              <strong>Install GLOHAUS</strong>
              <p>Keep your bookings and beauty business close.</p>
              <Link href="/install">
                {state.apple
                  ? "iPhone installation steps"
                  : "Install or view instructions"}
              </Link>
              <button
                type="button"
                className="pwa-dismiss"
                aria-label="Dismiss installation guide for 90 days"
                onClick={dismissInstall}
              >
                ×
              </button>
            </>
          )}
        </aside>
      )}
    </>
  );
}
