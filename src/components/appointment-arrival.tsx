"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArrivalAction, ArrivalState } from "@/modules/arrival/domain";
import { directionsUrl, lateness } from "@/modules/arrival/domain";
import { GeographicMap } from "./geographic-map";
import type { Coordinates } from "@/modules/professionals/location";
import "./appointment-arrival.css";

const time = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
const errors: Record<string, string> = {
  ARRIVAL_UNAVAILABLE:
    "This arrival option is not currently available for this appointment.",
  ARRIVAL_CHANGED:
    "The location or instructions changed. Reload and review the current version.",
  ARRIVAL_WINDOW:
    "Arrival tools are available from three hours before the appointment until it ends.",
  ARRIVAL_ACK_REQUIRED:
    "Review and acknowledge the current location instructions first.",
  ARRIVAL_ALREADY_RECORDED:
    "An arrival is already recorded. Use the dispute process for corrections.",
  ARRIVAL_RATE_LIMIT: "Please wait a moment before trying again.",
};
export function AppointmentArrival({
  bookingId,
  initial,
  publicPoint,
  publicKey,
}: {
  bookingId: string;
  initial: ArrivalState;
  publicPoint?: Coordinates | null;
  publicKey: string | null;
}) {
  const [data, setData] = useState(initial),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [point, setPoint] = useState<Coordinates | null>(
    initial.arrival ?? publicPoint ?? null,
  );
  const [active, setActive] = useState(false),
    [tracking, setTracking] = useState("Paused"),
    [dispute, setDispute] = useState("");
  const watch = useRef<number | null>(null),
    generation = useRef(0),
    running = useRef(false),
    lastSent = useRef(0),
    inflight = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const locationPoll = useRef<number | null>(null);
  const stopWatch = useCallback(() => {
    if (locationPoll.current !== null)
      window.clearInterval(locationPoll.current);
    locationPoll.current = null;
    generation.current++;
    running.current = false;
    inflight.current?.abort();
    if (watch.current !== null)
      navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    setActive(false);
  }, []);
  const submit = useCallback(
    async (body: ArrivalAction, signal?: AbortSignal) => {
      const response = await fetch(`/api/v1/bookings/${bookingId}/arrival`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          errors[result.error?.code] ||
            "Could not save this update. Please try again.",
        );
      setData(result);
      return result as ArrivalState;
    },
    [bookingId],
  );
  const promptVersion = data.arrival?.version;
  useEffect(() => {
    if (
      data.professional ||
      !promptVersion ||
      !panel.current ||
      !("IntersectionObserver" in window)
    )
      return;
    const version = promptVersion;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void submit({ action: "shown", version }).catch(() => {});
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [data.professional, promptVersion, submit]);
  async function run(body: ArrivalAction) {
    setBusy(true);
    setNotice("");
    try {
      await submit(body);
      setNotice("Saved to this appointment.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/bookings/${bookingId}/arrival`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error();
        const result: ArrivalState = await response.json();
        if (mounted) {
          setData(result);
          if (
            !result.windowOpen ||
            !result.config.smartArrival ||
            !result.arrival?.consent_at ||
            result.arrival.detected_at
          )
            stopWatch();
        }
      } catch {
        if (mounted)
          setNotice(
            "Status could not refresh. Check your connection; the last confirmed record is shown.",
          );
      }
    }, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      stopWatch();
    };
  }, [bookingId, stopWatch]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden && running.current) {
        stopWatch();
        setTracking("Paused — return here to resume");
        void submit({ action: "consent", enabled: false }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [stopWatch, submit]);
  async function start() {
    if (!navigator.geolocation || !window.isSecureContext) {
      setTracking("Location unavailable");
      setNotice(
        "This browser cannot access location. Manual check-in remains available.",
      );
      return;
    }
    stopWatch();
    const startToken = generation.current;
    setBusy(true);
    try {
      await submit({ action: "consent", enabled: true });
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not enable arrival detection.",
      );
      setBusy(false);
      return;
    }
    if (startToken !== generation.current) return;
    setBusy(false);
    running.current = true;
    const token = ++generation.current;
    setActive(true);
    setTracking("Requesting location permission…");
    lastSent.current = 0;
    const onPosition = async (position: GeolocationPosition) => {
      if (!running.current || token !== generation.current || document.hidden)
        return;
      if (Date.now() - lastSent.current < 6000 || inflight.current) return;
      lastSent.current = Date.now();
      const controller = new AbortController();
      inflight.current = controller;
      try {
        const result = await submit(
          {
            action: "reading",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            observedAt: new Date(position.timestamp).toISOString(),
          },
          controller.signal,
        );
        if (token !== generation.current) return;
        setTracking(
          result.arrival?.detected_at
            ? "Arrival detected"
            : position.coords.accuracy > 50
              ? "Location too approximate — use manual check-in if needed"
              : "Active — checking reliable readings",
        );
        if (result.arrival?.detected_at) stopWatch();
      } catch (e) {
        if (token === generation.current)
          setNotice(e instanceof Error ? e.message : "Location update failed.");
      } finally {
        if (inflight.current === controller) inflight.current = null;
      }
    };
    const onError = (error: GeolocationPositionError) => {
      if (token !== generation.current) return;
      stopWatch();
      setTracking(
        error.code === 1 ? "Permission denied" : "Location unavailable",
      );
      void submit({ action: "consent", enabled: false }).catch(() => {});
      setNotice(
        "You can continue your appointment and use “I’ve arrived”. Enable location later in your browser settings if you choose.",
      );
    };
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
    watch.current = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      options,
    );
    locationPoll.current = window.setInterval(() => {
      if (running.current && token === generation.current && !document.hidden)
        navigator.geolocation.getCurrentPosition(onPosition, onError, options);
    }, 8000);
  }
  async function stop() {
    stopWatch();
    setTracking("Paused");
    await run({ action: "consent", enabled: false });
  }
  const a = data.arrival,
    pro = data.professional,
    upcoming = data.status === "confirmed";
  if (!data.config.smartArrival && !data.config.journeyPlanner && !a)
    return null;
  return (
    <section
      ref={panel}
      className="appointment-arrival editor-form"
      aria-label={
        pro
          ? "Professional arrival management"
          : "Appointment travel and arrival"
      }
    >
      <p className="eyebrow">
        {pro ? "PROFESSIONAL ARRIVAL TOOLS" : "YOUR APPOINTMENT"}
      </p>
      <h2>{pro ? "Manage arrivals" : "Travel and arrival"}</h2>
      <p>Appointment: {time(data.startsAt)} · London time</p>
      <p>
        Accepted late-arrival allowance: {data.graceMinutes} minutes.{" "}
        {data.lateInstructions}
      </p>
      {pro &&
        upcoming &&
        (data.config.smartArrival || data.config.journeyPlanner) && (
          <details>
            <summary>
              Confirm appointment location and arrival instructions
            </summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!point) return;
                const form = new FormData(event.currentTarget);
                void run({
                  action: "configure",
                  enabled: form.get("enabled") === "on",
                  ...point,
                  instructions: String(form.get("instructions") || ""),
                  expectedVersion: a?.version ?? 0,
                });
              }}
            >
              <p>
                Choose the agreed service location for this booking. It is
                shared only with the booked customer. Changes require a new
                acknowledgement and stop existing sharing.
              </p>
              <GeographicMap
                focus={point ?? publicPoint ?? undefined}
                focusZoom={16}
                initialZoom={14}
                pins={
                  point
                    ? [
                        {
                          ...point,
                          id: "appointment",
                          label: "Agreed appointment location",
                        },
                      ]
                    : []
                }
                onChoose={setPoint}
              />
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-85"
                  max="85"
                  value={point?.latitude ?? ""}
                  onChange={(e) =>
                    setPoint({
                      latitude: Number(e.target.value),
                      longitude: point?.longitude ?? 0,
                    })
                  }
                  required
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={point?.longitude ?? ""}
                  onChange={(e) =>
                    setPoint({
                      longitude: Number(e.target.value),
                      latitude: point?.latitude ?? 51.5,
                    })
                  }
                  required
                />
              </label>
              <label>
                Arrival instructions
                <textarea
                  name="instructions"
                  defaultValue={a?.instructions ?? ""}
                  maxLength={1000}
                  placeholder="Entrance, floor, doorbell or access instructions"
                />
              </label>
              <label className="arrival-choice">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={a?.enabled ?? false}
                  disabled={!data.config.smartArrival}
                />
                Offer optional Smart Arrival ({data.config.radiusM} m default
                zone)
              </label>
              <label className="arrival-choice">
                <input type="checkbox" required />I confirm this is the agreed
                appointment location.
              </label>
              <button className="button" disabled={busy || !point}>
                Save location and notify customer
              </button>
            </form>
          </details>
        )}
      {!a && (
        <p>
          {pro
            ? "Confirm the appointment location to make arrival and journey tools available."
            : "Your professional has not confirmed the location for these tools yet. Contact them if you need directions."}
        </p>
      )}
      {a && (
        <>
          <p>
            <strong>Arrival instructions · version {a.version}</strong>
            <br />
            {a.instructions || "No additional entrance instructions."}
          </p>
          <a
            href={directionsUrl(a, "", "walking")}
            target="_blank"
            rel="noopener noreferrer"
          >
            View agreed location and directions
          </a>
          <p>
            {a.acknowledged_at
              ? `Customer acknowledged this version: ${time(a.acknowledged_at)}`
              : "Awaiting customer acknowledgement of these instructions."}
          </p>
          {!pro && upcoming && !a.acknowledged_at && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void run({ action: "acknowledge", version: a.version })
              }
            >
              I’ve reviewed the location and arrival instructions
            </button>
          )}
          {data.config.smartArrival && (
            <div className="arrival-records">
              {[
                ["Location-detected proximity", a.detected_at],
                ["Customer’s manual check-in", a.manual_at],
                ["Professional-confirmed attendance", a.attendance_at],
                ["Appointment started", a.started_at],
              ].map(([label, value]) => (
                <p key={label}>
                  <strong>{label}</strong>
                  <br />
                  {value ? time(value) : "Not recorded"}
                  {value && label === "Location-detected proximity" && (
                    <> · {lateness(data.startsAt, value, data.graceMinutes)}</>
                  )}
                </p>
              ))}
            </div>
          )}
          {!pro && data.config.smartArrival && upcoming && (
            <>
              <h3>Optional Smart Arrival</h3>
              <p>
                GLOHAUS checks whether you are near the agreed location while
                this page is open. Your professional receives an arrival time,
                without your movement history. This does not share your journey.
              </p>
              <p role="status">
                {a.detected_at ? "Arrival detected" : tracking}
              </p>
              {!a.detected_at && (
                <button
                  type="button"
                  className="button"
                  disabled={
                    busy || !a.enabled || !data.windowOpen || !a.acknowledged_at
                  }
                  onClick={() => void (active ? stop() : start())}
                >
                  {active ? "Stop Smart Arrival" : "Enable Smart Arrival"}
                </button>
              )}
              <button
                type="button"
                disabled={busy || !data.windowOpen || Boolean(a.manual_at)}
                onClick={() => void run({ action: "manual" })}
              >
                I’ve arrived
              </button>
              <small>
                Location permission is optional. Closed or backgrounded browsers
                cannot reliably detect arrival. If detection fails, check in
                manually. GPS proximity does not prove attendance.
              </small>
            </>
          )}
          {pro && data.config.smartArrival && upcoming && (
            <div className="arrival-actions">
              <button
                type="button"
                disabled={busy || !data.windowOpen || Boolean(a.attendance_at)}
                onClick={() => void run({ action: "attendance" })}
              >
                Confirm physical attendance
              </button>
              <button
                type="button"
                disabled={busy || !a.attendance_at || Boolean(a.started_at)}
                onClick={() => void run({ action: "started" })}
              >
                Record appointment started
              </button>
              <small>
                These actions do not complete the service, charge fees or change
                the booking’s payment status.
              </small>
            </div>
          )}
        </>
      )}
      {!pro && data.config.journeyPlanner && a && upcoming && (
        <CustomerJourney
          data={data}
          busy={busy}
          submit={run}
          bookingId={bookingId}
          publicKey={publicKey}
        />
      )}
      {!pro &&
        upcoming &&
        (data.config.journeyPlanner || data.config.smartArrival) && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("eta");
              void run({
                action: "late",
                eta: value ? new Date(String(value)).toISOString() : null,
              });
            }}
          >
            <h3>Running late?</h3>
            <label>
              Share estimated arrival (optional)
              <input name="eta" type="datetime-local" />
            </label>
            <button disabled={busy}>
              Notify my professional I’m running late
            </button>
            <small>No automatic cancellation or penalty is applied.</small>
          </form>
        )}
      {a && (
        <details>
          <summary>Report an arrival issue</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run({ action: "dispute", reason: dispute });
            }}
          >
            <label>
              Explain the issue
              <textarea
                value={dispute}
                onChange={(e) => setDispute(e.target.value)}
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <button disabled={busy}>Request a review</button>
            <p>
              Original timestamps are preserved. GLOHAUS can add a recorded
              correction after review.
            </p>
          </form>
        </details>
      )}
      {data.events
        .filter((e) => ["late", "dispute", "correction"].includes(e.kind))
        .slice(-5)
        .map((e) => (
          <p key={e.id}>
            {e.kind === "late"
              ? "Customer reported running late"
              : e.kind === "dispute"
                ? "Arrival review requested"
                : "GLOHAUS correction"}{" "}
            · {time(e.created_at)}{" "}
            {e.kind === "correction" ? String(e.details.reason ?? "") : ""}
          </p>
        ))}
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
function CustomerJourney({
  data,
  busy,
  submit,
  bookingId,
  publicKey,
}: {
  data: ArrivalState;
  busy: boolean;
  submit: (action: ArrivalAction) => Promise<void>;
  bookingId: string;
  publicKey: string | null;
}) {
  const [origin, setOrigin] = useState(""),
    [mode, setMode] = useState(data.plan?.mode ?? "driving"),
    [message, setMessage] = useState("");
  const locationGeneration = useRef(0);
  useEffect(
    () => () => {
      locationGeneration.current++;
    },
    [],
  );
  function useLocation() {
    const token = ++locationGeneration.current;
    if (!navigator.geolocation) {
      setMessage("Enter a starting address instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (token === locationGeneration.current)
          setOrigin(`${p.coords.latitude},${p.coords.longitude}`);
      },
      () => {
        if (token === locationGeneration.current)
          setMessage("Location unavailable. Enter a starting address instead.");
      },
      { maximumAge: 0, timeout: 12000 },
    );
  }
  async function enablePush() {
    try {
      if (
        !publicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "Push is unavailable here. In-app and email reminders remain available. On iPhone, use an installed Home Screen web app where supported.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Notification permission was not granted. You can continue without push.",
        );
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
      const response = await fetch(
        `/api/v1/bookings/${bookingId}/journey-push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        },
      );
      if (!response.ok)
        throw new Error("Could not register this device. Try again.");
      setMessage(
        "This device is registered for appointment updates. Push acceptance does not guarantee you will see a notification.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Push could not be enabled.");
    }
  }
  return (
    <details className="customer-journey">
      <summary>Plan my journey</summary>
      <p>
        Your starting address stays on this device until you choose to open
        Google Maps. It is not saved to GLOHAUS or shown to your professional.
      </p>
      <label>
        Starting address
        <input
          value={origin}
          onChange={(e) => {
            locationGeneration.current++;
            setOrigin(e.target.value);
          }}
          placeholder="Address or postcode"
          maxLength={300}
        />
      </label>
      <button type="button" onClick={useLocation}>
        Use my current location
      </button>
      <label>
        Transport
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="driving">Driving</option>
          <option value="transit">Public transport</option>
          <option value="walking">Walking</option>
          <option value="bicycling">Cycling</option>
        </select>
      </label>
      <a
        href={directionsUrl(data.arrival!, origin, mode)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Check route and current travel estimate in Google Maps
      </a>
      <p>
        Enter the journey duration from your directions below. GLOHAUS uses that
        estimate to calculate departure. Automatic traffic and transport
        monitoring is not connected.
      </p>
      <form
        key={data.plan?.revision ?? 0}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void submit({
            action: "plan",
            durationMinutes: Number(form.get("duration")),
            bufferMinutes: Number(form.get("buffer")),
            mode: mode as "driving",
            reminders: form.get("reminders") === "on",
          });
        }}
      >
        <label>
          Journey duration (minutes)
          <input
            type="number"
            name="duration"
            min={1}
            max={1440}
            defaultValue={data.plan?.duration_minutes ?? 35}
            required
          />
        </label>
        <label>
          Arrive early by (minutes)
          <input
            type="number"
            name="buffer"
            min={0}
            max={120}
            defaultValue={
              data.plan?.buffer_minutes ?? data.config.defaultBuffer
            }
            required
          />
        </label>
        <label className="arrival-choice">
          <input
            type="checkbox"
            name="reminders"
            defaultChecked={data.plan?.reminders ?? false}
            disabled={
              !data.config.departureReminders ||
              data.config.schedulerReady === false
            }
          />
          Send optional departure reminders
        </label>
        <button className="button" disabled={busy}>
          Save journey plan
        </button>
      </form>
      {data.plan && (
        <p>
          <strong>Recommended departure: {time(data.plan.departure_at)}</strong>
          <br />
          Based on your saved estimate, including {
            data.plan.buffer_minutes
          }{" "}
          minutes to arrive early.
        </p>
      )}
      {data.plan?.reminders && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit({ action: "reminders", enabled: false })}
        >
          Stop travel reminders
        </button>
      )}
      {data.config.departureReminders && (
        <button type="button" onClick={() => void enablePush()}>
          Enable phone notifications on this device
        </button>
      )}
      <small>
        Reminders run on the server and do not require this page to stay open.
        Delivery depends on your email provider, device permissions and
        connectivity. Live journey sharing is a separate choice.
      </small>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
