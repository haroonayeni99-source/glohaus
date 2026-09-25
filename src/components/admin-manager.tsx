"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOverview } from "@/modules/admin/repository";
export function AdminManager({ data }: { data: AdminOverview }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{
    type: "user" | "post" | "review" | "appeal" | "report";
    id: string;
    name: string;
  } | null>(null);
  return (
    <>
      <div className="analytics-grid">
        <article>
          <strong>{data.counts.users}</strong>
          <span>Total accounts</span>
        </article>
        <article>
          <strong>{data.professionals}</strong>
          <span>Professional profiles</span>
        </article>
        <article>
          <strong>{data.counts.suspended}</strong>
          <span>Suspended accounts</span>
        </article>
      </div>
      <p className="lead">
        The latest 100 accounts and posts. All management decisions are recorded
        in the audit log.
      </p>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {selection && (
        <form
          className="editor-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            try {
              const response = await fetch(
                selection.type === "appeal"
                  ? "/api/v1/admin/refund-appeals"
                  : "/api/v1/admin/manage",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    selection.type === "appeal"
                      ? {
                          appealId: selection.id,
                          approved: form.get("status") === "approved",
                          percentage: Number(form.get("percentage")),
                          reason: form.get("reason"),
                        }
                      : {
                          type: selection.type,
                          id: selection.id,
                          status: form.get("status"),
                          reason: form.get("reason"),
                        },
                  ),
                },
              );
              if (!response.ok)
                throw new Error(
                  "Change was not saved. Check your access and try again.",
                );
              setNotice("Change saved and recorded in the audit log.");
              setSelection(null);
              router.refresh();
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "Could not save.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Manage {selection.name}</h2>
          <label>
            New status
            <select name="status">
              {(selection.type === "appeal"
                ? ["approved", "rejected"]
                : selection.type === "user"
                  ? ["suspended", "active", "removed"]
                  : selection.type === "report"
                    ? ["under_review", "resolved", "dismissed"]
                  : ["hidden", "visible"]
              ).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          {selection.type === "appeal" && (
            <label>
              Refund percentage if approved
              <input
                name="percentage"
                type="number"
                min={0}
                max={100}
                defaultValue={100}
                required
              />
            </label>
          )}
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
            <small>
              Do not include medical details or other sensitive evidence.
              Removed accounts retain their records and can be restored.
            </small>
          </label>
          <div className="editor-actions">
            <button disabled={busy} className="button">
              Save decision
            </button>
            <button type="button" onClick={() => setSelection(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <h2 id="users" className="admin-section-title">Accounts</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id}>
                <td>{user.display_name}</td>
                <td>{user.email}</td>
                <td>{user.roles.join(", ")}</td>
                <td>{user.status}</td>
                <td>
                  {user.roles.includes("admin") ? (
                    "Operator managed"
                  ) : (
                    <button
                      onClick={() =>
                        setSelection({
                          type: "user",
                          id: user.id,
                          name: user.display_name,
                        })
                      }
                    >
                      Manage
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 id="professionals" className="admin-section-title">Professional management</h2>
      <p className="admin-section-intro">
        These are the accounts currently authorised to manage a GLOHAUS PRO business. Status changes use the same audited server-side action as account management.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Professional</th>
              <th>Email</th>
              <th>Access</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.users
              .filter((user) => user.roles.includes("professional"))
              .map((user) => (
                <tr key={user.id}>
                  <td>{user.display_name}</td>
                  <td>{user.email}</td>
                  <td>GLOHAUS PRO</td>
                  <td><span className={`admin-status admin-status-${user.status}`}>{user.status}</span></td>
                  <td>
                    <button
                      onClick={() =>
                        setSelection({ type: "user", id: user.id, name: user.display_name })
                      }
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            {!data.users.some((user) => user.roles.includes("professional")) && (
              <tr><td colSpan={5}>No professional accounts have been created yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <h2 id="live-access" className="admin-section-title">Professional verification & LIVE access</h2>
      <p className="admin-section-intro">
        Verification and LIVE restrictions are server-controlled and every change requires a reason for the audit log.
      </p>
      <div className="service-edit-list">
        {data.professionalTrust?.map((pro) => (
          <article className="service-edit-row" key={pro.id}>
            <div>
              <h3>{pro.business_name}</h3>
              <p>Verification: {pro.verification_status} · Standing: {pro.standing_status}</p>
              <small>{pro.live_restricted_until ? `LIVE restricted until ${new Date(pro.live_restricted_until).toLocaleString("en-GB")}` : "No timed LIVE restriction"}</small>
            </div>
            <form onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              try {
                const response = await fetch("/api/v1/admin/manage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "professionalTrust",
                    id: pro.id,
                    verification: form.get("verification"),
                    standing: form.get("standing"),
                    restrictedUntil: form.get("restrictedUntil") ? new Date(String(form.get("restrictedUntil"))).toISOString() : null,
                    reason: form.get("reason"),
                  }),
                });
                if (!response.ok) throw new Error("LIVE access decision was not saved.");
                setNotice("Professional verification/LIVE decision saved and audited.");
                router.refresh();
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Could not save.");
              } finally { setBusy(false); }
            }}>
              <select name="verification" defaultValue={pro.verification_status} aria-label={`Verification for ${pro.business_name}`}>
                {["unverified","pending","verified","rejected"].map(value => <option key={value}>{value}</option>)}
              </select>
              <select name="standing" defaultValue={pro.standing_status} aria-label={`Standing for ${pro.business_name}`}>
                <option value="good">good</option><option value="restricted">restricted</option>
              </select>
              <input name="restrictedUntil" type="datetime-local" aria-label={`LIVE restriction end for ${pro.business_name}`} />
              <input name="reason" required minLength={5} maxLength={500} placeholder="Reason for decision" aria-label={`Decision reason for ${pro.business_name}`} />
              <button disabled={busy}>Save LIVE access</button>
            </form>
          </article>
        ))}
        {!data.professionalTrust?.length && <p className="lead">Professional verification controls will appear after the LIVE eligibility migration is available.</p>}
      </div>
      <h2 id="bookings" className="admin-section-title">Booking overview</h2>
      <div className="service-edit-list">
        {data.bookings?.map((booking) => (
          <article className="service-edit-row" key={booking.id}>
            <div>
              <h3>
                {booking.service_name} · {booking.professional_name}
              </h3>
              <p>
                {booking.customer_name} ·{" "}
                {new Date(booking.starts_at).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                })}{" "}
                · {booking.status}
              </p>
            </div>
          </article>
        ))}
      </div>
      <h2 id="reviews" className="admin-section-title">Review moderation</h2>
      <h2 className="admin-section-title">Refund appeals</h2>
      <div className="service-edit-list">
        {data.appeals?.map((appeal) => (
          <article className="service-edit-row" key={appeal.id}>
            <div>
              <h3>
                {appeal.service_name} · {appeal.professional_name}
              </h3>
              <p>
                {appeal.customer_name}: {appeal.reason}
              </p>
              <small>{appeal.status}</small>
            </div>
            {appeal.status === "open" && (
              <button
                onClick={() =>
                  setSelection({
                    type: "appeal",
                    id: appeal.id,
                    name: `appeal for ${appeal.customer_name}`,
                  })
                }
              >
                Review
              </button>
            )}
          </article>
        ))}
        {!data.appeals?.length && (
          <p className="lead">No refund appeals need review.</p>
        )}
      </div>
      <div className="service-edit-list">
        {data.reviews?.map((review) => (
          <article className="service-edit-row" key={review.id}>
            <div>
              <h3>
                {review.public_name} · {review.rating}/5
              </h3>
              <p>{review.body}</p>
              <small>{review.moderation_status}</small>
            </div>
            <button
              onClick={() =>
                setSelection({
                  type: "review",
                  id: review.id,
                  name: review.public_name,
                })
              }
            >
              Moderate
            </button>
          </article>
        ))}
      </div>
      <h2 id="reports" className="admin-section-title">Safety reports</h2>
      {data.safety ? (
        <>
          <div className="analytics-grid admin-report-metrics">
            <article><strong>{data.safety.counts.open}</strong><span>Open reports</span></article>
            <article><strong>{data.safety.counts.underReview}</strong><span>Under review</span></article>
            <article><strong>{data.safety.counts.resolved}</strong><span>Resolved</span></article>
          </div>
          <div className="service-edit-list">
            {data.safety.reports.map((report) => (
              <article className="service-edit-row" key={report.id}>
                <div>
                  <h3>{report.category} · {report.target_type}</h3>
                  <p>{report.description}</p>
                  <small>{report.reporter_name} · {report.status}</small>
                </div>
                {!["resolved", "dismissed"].includes(report.status) && (
                  <button onClick={() => setSelection({ type: "report", id: report.id, name: `${report.category} report` })}>Review</button>
                )}
              </article>
            ))}
            {!data.safety.reports.length && <p className="lead">No safety reports need review.</p>}
          </div>
        </>
      ) : (
        <p className="lead">The safety report queue will appear after the owner-controls database migration is applied.</p>
      )}
      <h2 id="content" className="admin-section-title">Content moderation</h2>
      <div className="service-edit-list">
        {data.posts.map((post) => (
          <article className="service-edit-row" key={post.id}>
            <div>
              <h3>{post.title}</h3>
              <p>
                {post.business_name} · {post.moderation_status}
              </p>
              <details>
                <summary>Read content</summary>
                <p>{post.body}</p>
              </details>
            </div>
            <button
              onClick={() =>
                setSelection({ type: "post", id: post.id, name: post.title })
              }
            >
              Moderate
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
