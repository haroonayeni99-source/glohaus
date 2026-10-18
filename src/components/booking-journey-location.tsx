"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeographicMap } from "./geographic-map";
import { LocateFixed, MapPin, ShieldCheck } from "lucide-react";

type LocationState = {
  sharing: boolean;
  sessionToken?: string | null;
  active: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  expiresAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  observedAt: string | null;
};

const emptyState: LocationState = {
  sharing: false,
  active: false,
  startedAt: null,
  stoppedAt: null,
  expiresAt: null,
  latitude: null,
  longitude: null,
  accuracyM: null,
  observedAt: null,
};

export function BookingJourneyLocation({
  bookingId,
  professional,
  enabled,
}: {
  bookingId: string;
  professional: boolean;
  enabled: boolean;
}) {
  const [state, setState] = useState<LocationState>(emptyState);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const active = useRef(false);
  const epoch = useRef(0);
  const sending = useRef(false);
  const sessionToken = useRef<string | null>(null);
  const updateRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setState(emptyState);
      return;
    }
    const latest: LocationState = await response.json();
    setState(latest);
    if (!latest.sharing && watchId.current !== null) {
      active.current = false;
      epoch.current++;
      updateRequest.current?.abort();
      navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, [bookingId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(
      () => void refresh().catch(() => setState(emptyState)),
      0,
    );
    const timer = window.setInterval(
      () => void refresh().catch(() => setState(emptyState)),
      professional ? 15000 : 30000,
    );
    function clearTracking() {
      active.current = false;
      epoch.current++;
      updateRequest.current?.abort();
      if (watchId.current !== null)
        navigator.geolocation?.clearWatch(watchId.current);
    }
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      clearTracking();
    };
  }, [professional, refresh]);

  async function sendPosition(position: GeolocationPosition) {
    const now = Date.now();
    if (
      !active.current ||
      document.hidden ||
      sending.current ||
      now - lastSentAt.current < 15000
    )
      return;
    const token = epoch.current;
    sending.current = true;
    const controller = new AbortController();
    updateRequest.current = controller;
    try {
      lastSentAt.current = now;
      const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
        method: "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          sessionToken: sessionToken.current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
          observedAt: new Date(position.timestamp).toISOString(),
        }),
      });
      if (token !== epoch.current || !active.current) return;
      if (!response.ok) {
        setNotice(
          response.status === 409
            ? "Location sharing is available from 3 hours before the appointment until it ends."
            : "Your location could not be shared.",
        );
        return;
      }
      setState(await response.json());
      setNotice("Live journey location is being shared for this booking.");
    } catch {
      if (token === epoch.current)
        setNotice("Location update failed. Check your connection.");
    } finally {
      sending.current = false;
      if (updateRequest.current === controller) updateRequest.current = null;
    }
  }

  async function startSharing() {
    if (!navigator.geolocation) {
      setNotice("Location sharing is not supported by this browser.");
      return;
    }
    if (!enabled) return;
    active.current = true;
    epoch.current++;
    lastSentAt.current = 0;
    const token = epoch.current;
    setBusy(true);
    setNotice("Starting optional sharing…");
    try {
      const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!response.ok) throw new Error();
      const started: LocationState = await response.json();
      if (token !== epoch.current || !active.current) return;
      if (!started.sessionToken) throw new Error();
      sessionToken.current = started.sessionToken;
      setState(started);
    } catch {
      if (token === epoch.current) {
        active.current = false;
        setBusy(false);
        setNotice("Could not start sharing. Try again.");
      }
      return;
    }
    setNotice("Requesting location permission…");
    if (watchId.current !== null)
      navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!active.current || token !== epoch.current) return;
        setBusy(false);
        void sendPosition(position);
      },
      (error) => {
        if (token !== epoch.current) return;
        active.current = false;
        epoch.current++;
        if (watchId.current !== null)
          navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        void stopSharing();
        setBusy(false);
        setNotice(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was not granted. You can keep using GLOHAUS without sharing it."
            : "Your location is currently unavailable.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  }

  async function stopSharing() {
    active.current = false;
    epoch.current++;
    updateRequest.current?.abort();
    setBusy(true);
    if (watchId.current !== null) {
      navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    }
    let response: Response;
    try {
      response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
    } catch {
      setBusy(false);
      setState(emptyState);
      setNotice(
        "Device tracking stopped. Could not confirm the server update; shared positions expire after 90 seconds.",
      );
      return;
    }
    setBusy(false);
    if (!response.ok) {
      setNotice(
        "Location sharing could not be stopped. Refresh and try again.",
      );
      return;
    }
    setState(await response.json());
    setNotice("Location sharing stopped.");
  }

  useEffect(() => {
    const pause = () => {
      if (document.hidden && active.current) void stopSharing();
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  });

  useEffect(() => {
    if (!professional || !state.observedAt || !state.expiresAt) return;
    const expiry = Math.min(
      new Date(state.expiresAt).getTime(),
      new Date(state.observedAt).getTime() + 90000,
    );
    const timer = window.setTimeout(
      () =>
        setState((current) => ({
          ...current,
          active: false,
          latitude: null,
          longitude: null,
          accuracyM: null,
        })),
      Math.max(0, expiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [professional, state.observedAt, state.expiresAt]);

  if (!enabled && !state.startedAt) return null;

  const mapHref =
    state.latitude !== null && state.longitude !== null
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${state.latitude},${state.longitude}`)}`
      : null;

  return (
    <section
      className="editor-form booking-location-panel"
      aria-label="Booking journey location"
    >
      <div className="pro-panel-title">
        <div>
          <p className="eyebrow">OPTIONAL JOURNEY LOCATION</p>
          <h2>
            {professional
              ? "Customer journey status"
              : "Share when you’re on your way"}
          </h2>
        </div>
        <LocateFixed size={22} aria-hidden />
      </div>

      {professional ? (
        <>
          {state.latitude !== null && state.longitude !== null ? (
            <div className="booking-location-status">
              <p>
                <strong>
                  {state.active
                    ? "Live now"
                    : state.sharing
                      ? "Last update is stale"
                      : "Sharing stopped"}
                </strong>
                {state.observedAt
                  ? ` · updated ${new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(state.observedAt))}`
                  : ""}
              </p>
              <p>
                Accuracy:{" "}
                {state.accuracyM !== null
                  ? `about ${state.accuracyM} m`
                  : "unknown"}
              </p>
              {state.active && (
                <GeographicMap
                  focus={{
                    latitude: state.latitude,
                    longitude: state.longitude,
                  }}
                  focusZoom={14}
                  pins={[
                    {
                      id: "customer",
                      label: "Latest voluntarily shared customer location",
                      latitude: state.latitude,
                      longitude: state.longitude,
                    },
                  ]}
                />
              )}
              {mapHref && (
                <a href={mapHref} target="_blank" rel="noopener noreferrer">
                  <MapPin size={16} aria-hidden /> Open latest shared location
                </a>
              )}
              <small>
                This is the customer’s latest voluntarily shared journey
                location, not proof of attendance or fault.
              </small>
            </div>
          ) : (
            <p>
              The customer has not shared a journey location for this booking.
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            Share your latest location with this professional while travelling
            to the appointment. This is optional and is limited to this booking.
          </p>
          <div className="editor-actions">
            <button
              className="button"
              type="button"
              disabled={busy || !enabled}
              onClick={startSharing}
            >
              {state.active ? "Refresh live sharing" : "Start sharing"}
            </button>
            {state.sharing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void stopSharing()}
              >
                Stop sharing
              </button>
            )}
          </div>
          <small>
            <ShieldCheck size={14} aria-hidden /> Keep this booking page open
            for continuing updates. Browsers may pause location updates in the
            background. Sharing automatically expires when the appointment ends.
          </small>
        </>
      )}

      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
