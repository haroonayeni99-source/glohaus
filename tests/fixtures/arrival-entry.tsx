import React from "react";
import { createRoot } from "react-dom/client";
import { AppointmentArrival } from "@/components/appointment-arrival";
import { AdminArrival } from "@/components/admin-arrival";
import type { ArrivalState } from "@/modules/arrival/domain";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const professional = params.get("role") === "professional";
const state: ArrivalState = {
  professional,
  config: {
    smartArrival: true,
    journeyPlanner: true,
    journeySharing: true,
    departureReminders: true,
    radiusM: 100,
    defaultBuffer: 10,
    schedulerReady: true,
  },
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 7200000).toISOString(),
  status: "confirmed",
  windowOpen: true,
  graceMinutes: 10,
  lateInstructions: "Contact your professional if delayed.",
  arrival: {
    enabled: true,
    latitude: 51.5074,
    longitude: -0.1278,
    instructions: "Use the main entrance and ring the studio bell.",
    version: 1,
    radius_m: 100,
    acknowledged_at: null,
    consent_at: null,
    detected_at: null,
    manual_at: null,
    attendance_at: null,
    started_at: null,
    accuracy_m: null,
    last_reading_at: null,
    detection_status: "off",
  },
  plan: null,
  events: [],
};
(window as unknown as { arrivalRequests: unknown[] }).arrivalRequests = [];
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("/api/"))
    throw new Error("External network blocked in fixture");
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (body) {
    (window as unknown as { arrivalRequests: unknown[] }).arrivalRequests.push(
      body,
    );
    if (params.has("fail"))
      return Response.json(
        { error: { code: "ARRIVAL_CHANGED" } },
        { status: 409 },
      );
    const a = state.arrival!;
    if (body.action === "acknowledge")
      a.acknowledged_at = new Date().toISOString();
    if (body.action === "consent")
      a.consent_at = body.enabled ? new Date().toISOString() : null;
    if (body.action === "manual") a.manual_at = new Date().toISOString();
    if (body.action === "attendance")
      a.attendance_at = new Date().toISOString();
    if (body.action === "started") a.started_at = new Date().toISOString();
    if (body.action === "plan")
      state.plan = {
        duration_minutes: body.durationMinutes,
        buffer_minutes: body.bufferMinutes,
        mode: body.mode,
        reminders: body.reminders,
        departure_at: new Date(
          new Date(state.startsAt).getTime() -
            (body.durationMinutes + body.bufferMinutes) * 60000,
        ).toISOString(),
        revision: 1,
      };
  }
  return Response.json(structuredClone(state));
};
const root = createRoot(document.getElementById("root")!);
root.render(
  <main
    className="catalog-page"
    style={{ maxWidth: 960, margin: "auto", padding: 16 }}
  >
    {params.get("role") === "owner" ? (
      <AdminArrival
        owner
        initial={{
          config: state.config,
          counts: { detected: 2, manual: 1 },
          policy: null,
          events: [
            {
              id: "event",
              booking_id: "fictional-booking",
              kind: "acknowledged",
              created_at: new Date().toISOString(),
              details: { version: 1 },
            },
          ],
          communications: [
            {
              id: "notice",
              booking_id: "fictional-booking",
              title: "Appointment arrival update",
              body: "Review your location and arrival instructions.",
              created_at: new Date().toISOString(),
              read_at: null,
              sent_at: new Date().toISOString(),
              delivered_at: null,
              delivery_status: "sent",
              attempts: 1,
              last_error: null,
              push: [
                {
                  status: "accepted",
                  sentAt: new Date().toISOString(),
                  error: null,
                },
              ],
            },
          ],
        }}
      />
    ) : (
      <AppointmentArrival
        bookingId="fictional-booking"
        initial={state}
        publicKey={null}
      />
    )}
  </main>,
);
