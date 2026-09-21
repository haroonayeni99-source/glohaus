"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  days,
  clockTime,
  scheduleSchema,
  type Rule,
} from "@/modules/availability/domain";
export function AvailabilityEditor({ initial }: { initial: Rule[] }) {
  const [rules, setRules] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = scheduleSchema.safeParse({ rules });
        if (!parsed.success) {
          setNotice(parsed.error.issues[0].message);
          return;
        }
        setBusy(true);
        try {
          const response = await fetch("/api/v1/professional/availability", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
          });
          if (!response.ok)
            throw new Error("Could not save your hours. Please try again.");
          setNotice("Your working hours have been saved.");
          router.refresh();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Your usual working week.</h2>
      <p className="lead">
        Times are in Europe/London and automatically follow British Summer Time.
        Unchecked days are closed.
      </p>
      {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
        const rule = rules.find((r) => r.weekday === weekday);
        return (
          <div className="hours-row" key={weekday}>
            <label className="hours-day">
              <input
                type="checkbox"
                checked={Boolean(rule)}
                onChange={(event) =>
                  setRules((current) =>
                    event.target.checked
                      ? [
                          ...current,
                          { weekday, startMinute: 540, endMinute: 1020 },
                        ]
                      : current.filter((r) => r.weekday !== weekday),
                  )
                }
              />
              {days[weekday]}
            </label>
            {rule ? (
              <>
                <label>
                  Opens
                  <input
                    aria-label={`${days[weekday]} opening time`}
                    type="time"
                    step={900}
                    required
                    value={clockTime(rule.startMinute)}
                    onChange={(event) => {
                      const [hours, minutes] = event.target.value
                        .split(":")
                        .map(Number);
                      setRules((current) =>
                        current.map((r) =>
                          r.weekday === weekday
                            ? { ...r, startMinute: hours * 60 + minutes }
                            : r,
                        ),
                      );
                    }}
                  />
                </label>
                <label>
                  Closes
                  <input
                    aria-label={`${days[weekday]} closing time`}
                    type="time"
                    step={900}
                    required
                    value={clockTime(rule.endMinute)}
                    onChange={(event) => {
                      const [hours, minutes] = event.target.value
                        .split(":")
                        .map(Number);
                      setRules((current) =>
                        current.map((r) =>
                          r.weekday === weekday
                            ? { ...r, endMinute: hours * 60 + minutes }
                            : r,
                        ),
                      );
                    }}
                  />
                </label>
              </>
            ) : (
              <span className="closed-day">Closed</span>
            )}
          </div>
        );
      })}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      <button className="button" disabled={busy}>
        Save working hours
      </button>
    </form>
  );
}
