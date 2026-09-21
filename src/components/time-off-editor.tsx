"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { timeOffSchema, type TimeOff } from "@/modules/availability/domain";
const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
export function TimeOffEditor({ initial }: { initial: TimeOff[] }) {
  const router = useRouter();
  const [wholeDays, setWholeDays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="editor-form">
      <h2>Time off & breaks.</h2>
      <p>
        Block whole days or a few hours in London time. Your usual working week
        stays the same. Labels are private, and existing bookings must be
        managed before blocking their dates.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const parsed = timeOffSchema.safeParse({
            startDate: data.get("startDate"),
            endDate: data.get("endDate"),
            label: data.get("label"),
            ...(wholeDays
              ? {}
              : {
                  startTime: data.get("startTime"),
                  endTime: data.get("endTime"),
                }),
          });
          if (!parsed.success) {
            setNotice(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/v1/professional/time-off", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed.data),
            });
            if (!response.ok)
              throw new Error(
                response.status === 409
                  ? "These dates overlap an appointment or an active checkout. Manage the booking first, or wait for the checkout hold to expire."
                  : "Could not save time off. Please try again.",
              );
            form.reset();
            setNotice("Your time off has been saved.");
            router.refresh();
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not save time off.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Time off type
          <select
            value={wholeDays ? "days" : "hours"}
            disabled={busy}
            onChange={(event) => setWholeDays(event.target.value === "days")}
          >
            <option value="days">Whole days</option>
            <option value="hours">Specific hours</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            {wholeDays ? "First day off" : "Start date"}
            <input type="date" name="startDate" required disabled={busy} />
          </label>
          <label>
            {wholeDays ? "Last day off (included)" : "End date"}
            <input type="date" name="endDate" required disabled={busy} />
          </label>
        </div>
        {!wholeDays && (
          <div className="form-grid">
            <label>
              Start time (London)
              <input type="time" name="startTime" required disabled={busy} />
            </label>
            <label>
              End time (London)
              <input type="time" name="endTime" required disabled={busy} />
            </label>
          </div>
        )}
        <label>
          Private label
          <input
            name="label"
            maxLength={100}
            placeholder="For example, Summer holiday"
            required
            disabled={busy}
          />
        </label>
        <button className="button" disabled={busy}>
          Save time off
        </button>
      </form>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {initial.length ? (
        <ul className="time-off-list">
          {initial.map((block) => (
            <li key={block.id}>
              <div>
                <strong>{block.label}</strong>
                <p>
                  {date.format(new Date(block.startsAt))} –{" "}
                  {date.format(new Date(block.endsAt))}
                </p>
              </div>
              <button
                type="button"
                className="button small secondary"
                disabled={busy}
                aria-label={`Remove time off: ${block.label}`}
                onClick={async () => {
                  setBusy(true);
                  setNotice("");
                  try {
                    const response = await fetch(
                      `/api/v1/professional/time-off/${block.id}`,
                      {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                      },
                    );
                    if (!response.ok)
                      throw new Error("Could not remove time off.");
                    setNotice(
                      "Time off removed. These dates follow your usual working hours again.",
                    );
                    router.refresh();
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "Could not remove time off.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No upcoming time off.</p>
      )}
    </section>
  );
}
