"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { PolicyAdminOverview } from "@/modules/policies/domain";
import { ProfessionalPolicySummary } from "./professional-policy-summary";
import { defaultPolicy } from "@/modules/policies/domain";
import { money } from "@/modules/professionals/domain";
export function AdminProfessionalPolicies({
  initial,
}: {
  initial: PolicyAdminOverview;
}) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    const response = await fetch(
      `/api/v1/admin/policies?${new URLSearchParams({ q: query, ...(bookingId ? { bookingId } : {}) })}`,
    );
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error?.message || "Could not load policies.");
    setData(result);
  }
  function review(action: Record<string, unknown>) {
    if (reason.trim().length < 5) {
      setNotice("Enter a review reason of at least five characters.");
      return;
    }
    setDraft({ ...action, reason, confirmed: true });
    dialog.current?.showModal();
  }
  return (
    <div className="professional-policies">
      <p>
        Review policy versions and accepted booking snapshots. Custom wording is
        not legal certification and cannot override statutory rights. Flagging
        removes a version from future bookings without rewriting existing
        accepted terms. Health information and private preparation photographs
        are excluded from this view.
      </p>
      <form
        className="editor-form policy-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await load();
            setNotice("");
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not search.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Search professionals by name, slug or ID
          <input
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Booking ID (optional)
          <input
            value={bookingId}
            maxLength={36}
            onChange={(e) => setBookingId(e.target.value)}
          />
        </label>
        <button disabled={busy}>Search policies</button>
      </form>
      <label>
        Reason for the next review decision
        <textarea
          value={reason}
          minLength={5}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
        <small>
          Consider fairness, actual losses, statutory rights, safety and
          unlawful discrimination. Do not put customer health information here.
        </small>
      </label>
      <h3>Published policies and version history</h3>
      {data.versions.length ? (
        data.versions.map((v) => (
          <article className="policy-card" key={v.id}>
            <h4>
              {v.professional_name} · {v.service_name || "General policies"}
            </h4>
            <p>
              Version {v.version} · {v.review_status}{" "}
              {v.current && "· Current published version"} · Created{" "}
              {new Date(v.created_at).toLocaleString("en-GB")}
            </p>
            <details>
              <summary>Inspect this version</summary>
              <ProfessionalPolicySummary
                showPrice={false}
                policy={{
                  token: v.id,
                  generalVersionId: v.id,
                  serviceVersionId: null,
                  rules: {
                    ...defaultPolicy,
                    ...Object.fromEntries(
                      Object.entries(v.content).filter(([, x]) => x !== null),
                    ),
                  },
                  generalCustomRules: v.content.customRules,
                  serviceCustomRules: "",
                  timezone: "Europe/London",
                  pricePence: 0,
                  depositPence: 0,
                  bookingFeePence: 100,
                  fullPrepayment: false,
                  publishedAt: v.published_at,
                }}
              />
              {v.review_reason && <p>Review reason: {v.review_reason}</p>}
            </details>
            {v.review_status === "pending" && (
              <>
                <button
                  disabled={busy}
                  onClick={() => review({ action: "approve", versionId: v.id })}
                >
                  Approve publication
                </button>
                <button
                  disabled={busy}
                  onClick={() => review({ action: "reject", versionId: v.id })}
                >
                  Reject publication
                </button>
              </>
            )}
            <button
              disabled={busy || v.review_status === "flagged"}
              onClick={() => review({ action: "flag", versionId: v.id })}
            >
              Flag for policy concerns
            </button>
          </article>
        ))
      ) : (
        <p>No policy versions match this search.</p>
      )}
      <h3>Accepted customer booking terms</h3>
      {data.bookings.map((b) => (
        <details key={b.id}>
          <summary>
            {b.professional_name} · {b.service_name} · {b.customer_name}
          </summary>
          <p>
            Booking {b.id}.{" "}
            {b.acknowledged_at
              ? `Acknowledged ${new Date(b.acknowledged_at).toLocaleString("en-GB")}.`
              : "Legacy acknowledgement was not recorded."}{" "}
            General version {b.snapshot.generalVersionId || "default"}; service
            version {b.snapshot.serviceVersionId || "general/default"}.
          </p>
          <ProfessionalPolicySummary policy={b.snapshot} />
        </details>
      ))}
      <h3>Deposit retention reviews</h3>
      {data.retentions.map((r) => (
        <article key={r.booking_id} className="policy-card">
          <h4>
            {r.professional_name} · {r.customer_name}
          </h4>
          <p>
            Booking {r.booking_id}. Actual loss requested: {money(r.loss_pence)}{" "}
            · {r.status}.
          </p>
          <p>Evidence: {r.evidence}</p>
          <p>Mitigation: {r.mitigation}</p>
          {r.status === "pending" && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  review({
                    action: "retention",
                    bookingId: r.booking_id,
                    approved: true,
                  })
                }
              >
                Approve evidenced loss
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  review({
                    action: "retention",
                    bookingId: r.booking_id,
                    approved: false,
                  })
                }
              >
                Reject retention
              </button>
            </>
          )}
        </article>
      ))}
      <h3>Associated payment disputes</h3>
      {data.disputes.length ? (
        data.disputes.map((d) => (
          <article key={d.id} className="policy-card">
            <p>
              {d.professional_name} · Booking {d.booking_id} · {d.status} ·{" "}
              {money(d.amount_pence)}
            </p>
            <Link href="/admin#payment-disputes">
              Review in payment disputes
            </Link>
          </article>
        ))
      ) : (
        <p>No payment disputes match this search.</p>
      )}
      <h3>Policy audit log</h3>
      {data.audit.length ? (
        data.audit.map((a) => (
          <article className="policy-event" key={a.id}>
            <p>
              <strong>{a.action.replaceAll("_", " ")}</strong> ·{" "}
              {a.professional_name} ·{" "}
              {new Date(a.created_at).toLocaleString("en-GB")}
            </p>
            <p>
              By {a.actor_name} ({a.actor_id})
              {a.version_id && ` · Version ${a.version_id}`}
            </p>
            {a.reason && <p>Reason: {a.reason}</p>}
          </article>
        ))
      ) : (
        <p>No policy changes match this search.</p>
      )}
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      <dialog
        ref={dialog}
        className="policy-dialog"
        aria-labelledby="policy-review-title"
      >
        <h3 id="policy-review-title">Confirm policy review</h3>
        <p>
          {String(draft?.action || "")} —{" "}
          {String(draft?.versionId || draft?.bookingId || "")}
        </p>
        <p>{String(draft?.reason || "")}</p>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const response = await fetch("/api/v1/admin/policies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draft),
              });
              const result = await response.json();
              if (!response.ok)
                throw Error(result.error?.message || "Could not save review.");
              dialog.current?.close();
              setDraft(null);
              setNotice(
                "Review recorded. Existing booking snapshots remain unchanged.",
              );
              await load();
            } catch (e) {
              setNotice(e instanceof Error ? e.message : "Could not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm review decision
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setDraft(null);
            dialog.current?.close();
          }}
        >
          Cancel
        </button>
      </dialog>
    </div>
  );
}
