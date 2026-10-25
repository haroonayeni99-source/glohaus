"use client";
import { useId, useState } from "react";
import {
  caseKinds,
  identityReviews,
  retentionSchedule,
  type SupportOperations,
  type SupportOperationsQueue,
} from "@/modules/support/operations";

function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", { timeZone: "Europe/London" })
    : "Not applicable";
}
export function SupportOperationsPanel({
  caseId,
  onOpenCase,
}: {
  caseId?: string;
  onOpenCase?: (id: string) => void;
}) {
  const formId = useId();
  const [data, setData] = useState<
    SupportOperations | SupportOperationsQueue | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(
        `/api/v1/admin/support/operations${caseId ? `?caseId=${caseId}` : ""}`,
        { cache: "no-store" },
      );
      if (!r.ok)
        throw Error(
          "Could not load. Owner access and recent MFA are required.",
        );
      setData(await r.json());
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/v1/admin/support/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caseId, ...Object.fromEntries(f) }),
      });
      if (!r.ok)
        throw Error(
          "Not saved. Check the reason, review date, hold justification and Owner MFA.",
        );
      const refreshed = await load();
      setNotice(
        refreshed
          ? "Review recorded privately in case history and the audit log. No data was deleted, disclosed or exported."
          : "Review saved. Refresh failed; reopen the review before making another change.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const item = data && "kind" in data ? data : null;
  const queue = data && "items" in data ? data : null;
  return (
    <section
      className="admin-detail-card support-operations"
      style={{ padding: 18, marginBlock: 18 }}
    >
      <h3>
        {caseId
          ? "Privacy, identity & retention review"
          : "Privacy deadlines & retention reviews"}
      </h3>
      <p>
        Owner-only review. This records decisions and follow-up dates; it does
        not export personal data, remove evidence or change financial records.
      </p>
      <button type="button" disabled={busy} onClick={() => void load()}>
        {busy ? "Loading…" : data ? "Refresh review" : "Open review"}
      </button>
      {notice && <p role="status">{notice}</p>}
      {queue && (
        <>
          <p>
            {queue.rightsPending} open data-rights requests. Up to 50 earliest
            privacy, complaint or overdue retention reviews are shown. Complete
            reviews to reveal the next items.
          </p>
          {queue.items.map((row) => (
            <article key={row.id} className="service-edit-row">
              <div>
                <strong>
                  {row.topic} · {row.id}
                </strong>
                <p>
                  {row.status.replaceAll("_", " ")} ·{" "}
                  {row.onHold
                    ? "Documented retention hold"
                    : "No retention hold"}
                </p>
                {row.rightsDueAt && (
                  <p>
                    Rights-response / complaint-acknowledgement target:{" "}
                    {date(row.rightsDueAt)}
                  </p>
                )}
                {row.reviewAt && <p>Retention review: {date(row.reviewAt)}</p>}
                <button type="button" onClick={() => onOpenCase?.(row.id)}>
                  Open case for review
                </button>
              </div>
            </article>
          ))}
          {!queue.items.length && (
            <p>No pending privacy cases or overdue retention reviews.</p>
          )}
        </>
      )}
      {item && (
        <>
          <p>
            Rights-response / complaint-acknowledgement target:{" "}
            <strong>{date(item.rightsDueAt)}</strong>. This conservative target
            never pauses merely because a case is awaiting a reply.
          </p>
          <p>
            Evidence review: {date(item.evidenceReviewAt)} · Case review:{" "}
            {date(item.caseReviewAt)} · Next recorded review:{" "}
            {date(item.nextReviewAt)}
          </p>
          <form
            className="editor-form"
            onSubmit={save}
            key={JSON.stringify(item)}
          >
            <label>
              Original request received on
              <input
                type="date"
                name="receivedOn"
                required
                defaultValue={item.receivedOn}
              />
            </label>
            <p>
              For an email or verbal request, use its original receipt date, not
              the day staff logged this ticket. A later date cannot move the
              deadline beyond ticket creation.
            </p>
            <label htmlFor={`${formId}-kind`}>Case purpose</label>
            <select id={`${formId}-kind`} name="kind" defaultValue={item.kind}>
              {caseKinds.map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <label htmlFor={`${formId}-identity`}>Identity review</label>
            <select
              id={`${formId}-identity`}
              name="identity"
              defaultValue={item.identity}
            >
              {identityReviews.map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <p>
              Use existing account/booking checks where sufficient. Record why
              verification is complete or unnecessary; do not upload identity
              documents to this support case.
            </p>
            <label>
              Retention hold justification (leave blank if none)
              <textarea
                name="holdReason"
                maxLength={500}
                defaultValue={item.holdReason}
              />
            </label>
            <label>
              Next review date (required for a hold)
              <input
                type="date"
                name="nextReviewAt"
                defaultValue={item.nextReviewAt?.slice(0, 10) ?? ""}
              />
            </label>
            <label>
              Review reason and actions taken
              <textarea name="reason" minLength={10} maxLength={500} required />
            </label>
            <button className="button" disabled={busy}>
              Record privacy / retention review
            </button>
          </form>
          <p>
            To finish a data request, record proportionate identity review and
            post a public outcome on the private ticket. Owner review is
            required. A case link or an email sender alone is not proof of
            identity.
          </p>
        </>
      )}
      <details>
        <summary>How to handle requests, complaints and retention</summary>
        <ol>
          <li>
            Acknowledge promptly using the existing two-weekday response target.
            Record the received date, request and scope; data requests can also
            arrive by email or other channels and should be logged here.
          </li>
          <li>
            Normally respond to rights requests without undue delay within one
            calendar month. Review necessary identity/authority checks promptly.
            A justified pause or complex-request extension needs documented
            dates, grounds and timely notice; it is not applied automatically by
            this dashboard.
          </li>
          <li>
            Acknowledge privacy complaints within 30 days, investigate without
            undue delay, keep the person informed and give a reasoned outcome.
            They can appeal through their ticket and contact the ICO.
          </li>
          <li>
            Search the relevant account, booking and case records, protect other
            people’s information, and use an appropriate secure delivery method.
            Record what was supplied, corrected, restricted or lawfully
            retained. Do not paste full exports or identity documents into
            notes.
          </li>
          <li>
            Review retention monthly. Erase or anonymise data that is no longer
            needed using the approved account/data process; record completion
            and any provider/back-up follow-up. A review note is not proof that
            deletion happened. Holds need a specific justification and a dated
            recheck.
          </li>
        </ol>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Operating retention policy</th>
              </tr>
            </thead>
            <tbody>
              {retentionSchedule.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
