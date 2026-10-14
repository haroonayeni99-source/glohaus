"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  activityDate,
  type ActivityOverview,
  type ProfessionalActivity,
} from "@/modules/professional-activity/domain";

type Decision = {
  professional: ProfessionalActivity;
  action: "offer_boost" | "hide" | "restore";
  reason: string;
};
const labels = {
  offer_boost: "Offer seven-day boost",
  hide: "Hide from discovery",
  restore: "Restore discovery visibility",
};

export function AdminProfessionalActivity({
  initial,
  owner,
}: {
  initial: ActivityOverview;
  owner: boolean;
}) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  async function load(search: string, page: number) {
    const response = await fetch(
      `/api/v1/admin/professional-activity?${new URLSearchParams({ q: search, page: String(page) })}`,
    );
    const result = await response.json();
    if (!response.ok)
      throw Error(
        result.error?.message ||
          "Could not load activity. Check your Owner/Admin security session and retry.",
      );
    setData(result);
    setAppliedQuery(search);
  }
  async function refresh(search: string, page: number) {
    setBusy(true);
    setNotice("");
    try {
      await load(search, page);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load activity.",
      );
    } finally {
      setBusy(false);
    }
  }
  function review(
    professional: ProfessionalActivity,
    action: Decision["action"],
  ) {
    if (reason.trim().length < 5) {
      setNotice(
        "Add a reason of at least five characters before reviewing a decision.",
      );
      return;
    }
    setDecision({ professional, action, reason: reason.trim() });
    dialog.current?.showModal();
  }
  async function save() {
    if (!decision || busy) return;
    setBusy(true);
    setNotice("");
    let saved = false;
    try {
      const response = await fetch("/api/v1/admin/professional-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: decision.professional.id,
          action: decision.action,
          reason: decision.reason,
          confirmed: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error?.message ||
            "Could not save. Check your Owner security session and refresh the list.",
        );
      saved = true;
      dialog.current?.close();
      setDecision(null);
      setReason("");
      await load(appliedQuery, data.page);
      setNotice("Decision saved and recorded in the audit log.");
    } catch (error) {
      setNotice(
        saved
          ? "Decision saved. Refresh the list to see its latest state."
          : error instanceof Error
            ? error.message
            : "Could not save the decision.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="professional-activity-panel">
      <p>
        Alerts start after 14 days without observed professional activity, with
        follow-ups at 30 and 60 days. Website use and confirmed or completed
        bookings count. No bookings alone does not mean inactivity.
      </p>
      <p>
        A seven-day visibility boost needs an Owner offer and professional
        acceptance. Hiding requires 60 days of inactivity, a warning at least
        seven days old and your confirmation. Account access, direct profile
        links, existing bookings and earnings are preserved.
      </p>
      <form
        className="activity-search"
        onSubmit={(event) => {
          event.preventDefault();
          void refresh(query, 0);
        }}
      >
        <label>
          Search inactive professionals
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button disabled={busy}>Search activity</button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh(appliedQuery, data.page)}
        >
          Refresh list
        </button>
      </form>
      <p>
        {data.total} professionals match. Checked {activityDate(data.asOf)}{" "}
        (London time).
      </p>
      <p className="activity-email-status">
        Email queue: {data.email.pending} pending · {data.email.accepted}{" "}
        accepted by provider · {data.email.cancelled} cancelled or opted out ·{" "}
        {data.email.exhausted} need attention. In-app notices are recorded
        separately.
      </p>
      {owner ? (
        <label className="activity-reason">
          Reason for the next decision
          <textarea
            value={reason}
            minLength={5}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : (
        <p>
          Read-only view. An Owner must approve offers and discovery changes.
        </p>
      )}
      <div className="activity-rows">
        {data.rows.map((pro) => (
          <article className="activity-card" key={pro.id}>
            <h3>{pro.business_name || "Professional profile"}</h3>
            <p>
              {pro.inactive_days} days{" "}
              {pro.activity_source === "monitoring_started"
                ? "since monitoring started; no activity observed yet"
                : "since observed activity"}
              .{" "}
              {pro.hidden_at
                ? "Hidden from discovery."
                : `Profile: ${pro.publication_status}.`}
            </p>
            <dl>
              <div>
                <dt>
                  {pro.activity_source === "monitoring_started"
                    ? "Monitoring baseline"
                    : "Last observed activity"}
                </dt>
                <dd>{activityDate(pro.last_activity_at)}</dd>
              </div>
              <div>
                <dt>Warning recorded</dt>
                <dd>{activityDate(pro.warning_at)}</dd>
              </div>
              <div>
                <dt>Boost offer expires</dt>
                <dd>{activityDate(pro.offer_until)}</dd>
              </div>
              <div>
                <dt>Boost ends</dt>
                <dd>{activityDate(pro.boost_until)}</dd>
              </div>
              <div>
                <dt>Upcoming confirmed bookings</dt>
                <dd>{pro.upcoming_bookings}</dd>
              </div>
            </dl>
            <div className="activity-actions">
              {pro.slug && <Link href={`/p/${pro.slug}`}>View profile</Link>}
              {owner && (
                <>
                  <button
                    type="button"
                    disabled={busy || !pro.can_offer}
                    onClick={() => review(pro, "offer_boost")}
                  >
                    {labels.offer_boost}
                  </button>
                  {pro.hidden_at ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review(pro, "restore")}
                    >
                      {labels.restore}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !pro.can_hide}
                      onClick={() => review(pro, "hide")}
                    >
                      {labels.hide}
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {!data.rows.length && (
          <p role="status">
            No inactive professionals match this search. Existing profiles
            receive a fresh 14-day monitoring period when tracking starts.
          </p>
        )}
      </div>
      <div className="activity-actions">
        <button
          type="button"
          disabled={busy || data.page === 0}
          onClick={() => void refresh(appliedQuery, data.page - 1)}
        >
          Previous page
        </button>
        <span>Page {data.page + 1}</span>
        <button
          type="button"
          disabled={busy || (data.page + 1) * 50 >= data.total}
          onClick={() => void refresh(appliedQuery, data.page + 1)}
        >
          Next page
        </button>
      </div>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <dialog
        ref={dialog}
        aria-labelledby="activity-confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setDecision(null);
        }}
      >
        {decision && (
          <>
            <h3 id="activity-confirm-title">
              Confirm: {labels[decision.action]}
            </h3>
            <p>
              {decision.professional.business_name || "Professional profile"}
            </p>
            <p>
              {decision.action === "offer_boost"
                ? "The professional has 14 days to accept this free offer. The seven-day boost starts on acceptance; fees stay the same."
                : decision.action === "hide"
                  ? "This profile will be excluded from discovery results. Their account, direct profile link, existing bookings and earnings stay available."
                  : "This removes the inactivity discovery restriction. Usual publication and account requirements still apply."}
            </p>
            <p>Reason: {decision.reason}</p>
            <div className="activity-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dialog.current?.close();
                  setDecision(null);
                }}
              >
                Cancel decision
              </button>
              <button type="button" disabled={busy} onClick={() => void save()}>
                Confirm decision
              </button>
            </div>
            {notice && <p role="alert">{notice}</p>}
          </>
        )}
      </dialog>
    </div>
  );
}
