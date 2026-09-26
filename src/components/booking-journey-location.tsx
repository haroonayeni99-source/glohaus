"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, ShieldCheck } from "lucide-react";

type LocationState = {
  sharing: boolean;
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

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    setState(await response.json());
  }, [bookingId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(
      () => void refresh(),
      professional ? 15000 : 30000,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      if (watchId.current !== null)
        navigator.geolocation?.clearWatch(watchId.current);
    };
  }, [professional, refresh]);

  async function sendPosition(position: GeolocationPosition) {
    const now = Date.now();
    if (now - lastSentAt.current < 15000) return;
    lastSentAt.current = now;
    const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: Math.round(position.coords.accuracy),
        observedAt: new Date(position.timestamp).toISOString(),
      }),
    });
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
  }

  function startSharing() {
    if (!navigator.geolocation) {
      setNotice("Location sharing is not supported by this browser.");
      return;
    }
    setBusy(true);
    setNotice("Requesting location permission…");
    if (watchId.current !== null)
      navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setBusy(false);
        void sendPosition(position);
      },
      (error) => {
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
    setBusy(true);
    if (watchId.current !== null) {
      navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    }
    const response = await fetch(`/api/v1/bookings/${bookingId}/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    setBusy(false);
    if (!response.ok) {
      setNotice("Location sharing could not be stopped. Refresh and try again.");
      return;
    }
    setState(await response.json());
    setNotice("Location sharing stopped.");
  }

  if (!enabled && !state.startedAt) return null;

  const mapHref =
    state.latitude !== null && state.longitude !== null
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${state.latitude},${state.longitude}`)}`
      : null;

  return (
    <section className="editor-form booking-location-panel" aria-label="Booking journey location">
      <div className="pro-panel-title">
        <div>
          <p className="eyebrow">OPTIONAL JOURNEY LOCATION</p>
          <h2>{professional ? "Customer journey status" : "Share when you’re on your way"}</h2>
        </div>
        <LocateFixed size={22} aria-hidden />
      </div>

      {professional ? (
        <>
          {state.latitude !== null && state.longitude !== null ? (
            <div className="booking-location-status">
              <p>
                <strong>{state.active ? "Live now" : state.sharing ? "Last update is stale" : "Sharing stopped"}</strong>
                {state.observedAt
                  ? ` · updated ${new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(state.observedAt))}`
                  : ""}
              </p>
              <p>
                Accuracy: {state.accuracyM !== null ? `about ${state.accuracyM} m` : "unknown"}
              </p>
              {mapHref && (
                <a href={mapHref} target="_blank" rel="noopener noreferrer">
                  <MapPin size={16} aria-hidden /> Open latest shared location
                </a>
              )}
              <small>
                This is the customer’s latest voluntarily shared journey location, not proof of attendance or fault.
              </small>
            </div>
          ) : (
            <p>The customer has not shared a journey location for this booking.</p>
          )}
        </>
      ) : (
        <>
          <p>
            Share your latest location with this professional while travelling to the appointment.
            This is optional and is limited to this booking.
          </p>
          <div className="editor-actions">
            <button className="button" type="button" disabled={busy || !enabled} onClick={startSharing}>
              {state.active ? "Refresh live sharing" : "Start sharing"}
            </button>
            {state.sharing && (
              <button type="button" disabled={busy} onClick={() => void stopSharing()}>
                Stop sharing
              </button>
            )}
          </div>
          <small>
            <ShieldCheck size={14} aria-hidden /> Keep this booking page open for continuing updates.
            Browsers may pause location updates in the background. Sharing automatically expires when the appointment ends.
          </small>
        </>
      )}

      {notice && <p className="form-notice" role="status">{notice}</p>}
    </section>
  );
}
