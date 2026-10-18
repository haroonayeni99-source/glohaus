"use client";
import { useEffect, useRef, useState } from "react";
import type { ArrivalState } from "@/modules/arrival/domain";
import {
  originSchema,
  type RouteStatus,
} from "@/modules/journey-routing/domain";

const messages: Record<string, string> = {
  ROUTE_RATE_LIMIT: "Please wait 30 seconds before calculating again.",
  ROUTE_BUDGET_LIMIT:
    "Automatic route estimates have reached today's or this month's limit. You can enter your own estimate below.",
  ROUTE_NOT_FOUND:
    "No suitable route was returned. Check the starting address, transport and appointment date, or enter a duration below.",
  ROUTE_CHANGED:
    "Your appointment or plan changed during the calculation. Reload and try again.",
};
export function AutomaticJourneyRoute({
  bookingId,
  origin,
  mode,
  data,
  onSaved,
  onBusyChange,
}: {
  bookingId: string;
  origin: string;
  mode: string;
  data: ArrivalState;
  onSaved: (state: ArrivalState) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<RouteStatus | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    travelMinutes: number;
    trafficAware: boolean;
    transitSchedule: boolean;
    warnings: string[];
    inputOrigin: string;
    inputMode: string;
    planRevision: number;
  } | null>(null);
  const mounted = useRef(false);
  const endpoint = `/api/v1/bookings/${bookingId}/journey-route`;
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (r.ok && mounted.current) setStatus(await r.json());
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      abort.abort();
    };
  }, [endpoint, data.plan?.revision]);
  const currentResult =
    result?.inputOrigin === origin &&
    result.inputMode === mode &&
    result.planRevision === data.plan?.revision
      ? result
      : null;
  if (!status?.enabled || !status.configured)
    return (
      <p>
        Automatic estimates are not currently available. Check directions and
        enter a journey duration below.
      </p>
    );
  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      form.get("automaticUpdates") === "on" &&
      form.get("routeReminders") !== "on"
    ) {
      setNotice(
        "Select optional departure reminders to receive automatic route updates.",
      );
      return;
    }
    const coordinates = origin
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const parsed = originSchema.safeParse(
      coordinates
        ? {
            latitude: Number(coordinates[1]),
            longitude: Number(coordinates[2]),
          }
        : { address: origin.trim() },
    );
    if (!parsed.success) {
      setNotice(
        "Enter a starting address or allow your current location first.",
      );
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: parsed.data,
          mode,
          bufferMinutes: Number(form.get("autoBuffer")),
          reminders: form.get("routeReminders") === "on",
          automaticUpdates: form.get("automaticUpdates") === "on",
          providerConsent: true,
        }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          messages[value.error?.code] ||
            "The automatic estimate is unavailable. Your previous plan is unchanged; try again or use a manual estimate.",
        );
      if (mounted.current) {
        onSaved(value.state);
        setResult({
          ...value.estimate,
          inputOrigin: origin,
          inputMode: mode,
          planRevision: value.state.plan.revision,
        });
        setStatus(
          (s) =>
            s && {
              ...s,
              checkedAt: value.estimate.checkedAt,
              automaticUpdates: value.automaticUpdates,
              lastError: null,
            },
        );
        setNotice(
          "Estimated journey and departure time saved to this appointment.",
        );
      }
    } catch (e) {
      if (mounted.current)
        setNotice(
          e instanceof Error ? e.message : "Could not calculate the route.",
        );
    } finally {
      onBusyChange(false);
      if (mounted.current) setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error();
      setStatus((s) => s && { ...s, automaticUpdates: false });
      setNotice(
        "Automatic route updates stopped and the encrypted starting location removed. Your saved estimate remains.",
      );
    } catch {
      setNotice("Could not stop automatic updates. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="automatic-journey-route">
      <h4>Calculate my journey</h4>
      <p>
        Calculate a route using Google Maps. Your chosen starting point and
        appointment location are sent to Google only when you choose Calculate.
        They are not shown to your professional.
      </p>
      <form onSubmit={calculate}>
        <label>
          Automatic route arrival buffer (minutes)
          <input
            name="autoBuffer"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={
              data.plan?.buffer_minutes ?? data.config.defaultBuffer
            }
            disabled={busy}
          />
        </label>
        <label className="arrival-choice">
          <input
            type="checkbox"
            name="routeReminders"
            disabled={
              !data.config.departureReminders ||
              data.config.schedulerReady === false ||
              busy
            }
            defaultChecked={data.plan?.reminders ?? false}
          />
          Send optional departure reminders for this route
        </label>
        <label className="arrival-choice">
          <input
            type="checkbox"
            name="automaticUpdates"
            disabled={
              !data.config.departureReminders ||
              data.config.schedulerReady === false ||
              busy
            }
            defaultChecked={status.automaticUpdates}
          />
          Recheck this route until departure and notify me of significant
          increases
        </label>
        <p>
          <small>
            Rechecks require departure reminders. If selected, GLOHAUS
            temporarily saves your chosen starting point encrypted for this
            appointment. It is removed when you stop updates or the route
            expires. This does not enable live location sharing or track whether
            you have left. Rechecks use the saved origin, even if you move.
          </small>
        </p>
        <label className="arrival-choice">
          <input
            name="providerConsent"
            type="checkbox"
            required
            disabled={busy}
          />
          Use Google Maps to calculate this appointment journey
        </label>
        <button className="button" disabled={busy || !origin.trim()}>
          {busy ? "Calculating…" : "Calculate and save journey"}
        </button>
      </form>
      {currentResult && (
        <div className="google-route-estimate">
          <p>
            Estimated travel: {currentResult.travelMinutes} minutes.{" "}
            {currentResult.trafficAware
              ? "Traffic-aware driving forecast; conditions may change."
              : currentResult.transitSchedule
                ? "Based on the public-transport timetable returned for your arrival time. Live disruption coverage is not guaranteed."
                : "Route estimate; conditions and accessibility may vary."}
          </p>
          {currentResult.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          <p className="google-maps-attribution" translate="no">
            Google Maps
          </p>
        </div>
      )}
      {status.checkedAt && (
        <p>
          Last route check:{" "}
          {new Date(status.checkedAt).toLocaleString("en-GB", {
            timeZone: "Europe/London",
          })}{" "}
          London time. Saved estimates are not a guarantee of current
          conditions.
        </p>
      )}
      {status.lastError && (
        <p role="status">
          The last route recheck was unavailable. Use current directions before
          travelling; your previous estimate is retained.
        </p>
      )}
      {status.automaticUpdates && (
        <button type="button" disabled={busy} onClick={() => void stop()}>
          Stop automatic route updates
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
