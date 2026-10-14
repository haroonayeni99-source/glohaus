"use client";
import { useState } from "react";
import Link from "next/link";
import {
  activityDate,
  type MyActivity,
} from "@/modules/professional-activity/domain";

export function ProfessionalActivityStatus({
  initial,
}: {
  initial: MyActivity;
}) {
  const [data, setData] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!data.hidden && !data.offerUntil && !data.boostUntil) return null;
  return (
    <section
      className="pro-setup-card professional-activity-panel"
      aria-label="Discovery visibility"
    >
      <h2>Discovery visibility</h2>
      {data.hidden ? (
        <p>
          Your profile is hidden from discovery following an inactivity review.
          Your existing bookings and earnings stay available.{" "}
          <Link href="/contact">Contact support to request restoration</Link>.
        </p>
      ) : data.boostUntil ? (
        <p>
          Your free visibility boost runs until {activityDate(data.boostUntil)}{" "}
          (London time). Your fees stay the same.
        </p>
      ) : (
        <>
          <p>
            You have an Owner-approved free seven-day visibility boost. Accept
            by {activityDate(data.offerUntil)} (London time). It starts when you
            accept and does not guarantee bookings.
          </p>
          <Link href="/professional/availability">
            Review your availability
          </Link>
          {!data.eligible && (
            <p>
              Publish your profile and activate a service before accepting.
              Usual account and verification restrictions apply.
            </p>
          )}
          <label className="activity-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I have checked my profile and availability and want to start my
            seven-day boost.
          </label>
          <button
            disabled={busy || !confirmed || !data.eligible}
            onClick={async () => {
              setBusy(true);
              setNotice("");
              let saved = false;
              try {
                const response = await fetch("/api/v1/professional/activity", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "accept_boost",
                    confirmed: true,
                  }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw Error(
                    result.error?.message ||
                      "Could not start your boost. Refresh and try again.",
                  );
                saved = true;
                const current = await fetch("/api/v1/professional/activity");
                if (!current.ok)
                  throw Error("Could not refresh your visibility status.");
                setData(await current.json());
                setNotice("Your seven-day visibility boost is active.");
              } catch (error) {
                setNotice(
                  saved
                    ? "Your boost started. Refresh this page to see its end date."
                    : error instanceof Error
                      ? error.message
                      : "Could not start your boost.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Start my seven-day boost
          </button>
        </>
      )}
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
