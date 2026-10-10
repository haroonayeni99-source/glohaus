"use client";
import { requireAdminResponse } from "@/lib/admin-response";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentTime } from "@/components/use-current-time";
import { useRouter } from "next/navigation";
import type { AdminOverview } from "@/modules/admin/repository";
import { OwnerUserActions } from "@/components/owner-user-actions";
import { AdminSectionUnavailable } from "@/components/admin-section-unavailable";
export function AdminManager({ data, owner = false, hardDeleteConfigured = false }: { data: AdminOverview; owner?: boolean; hardDeleteConfigured?: boolean }) {
  const router = useRouter();
  const now = useCurrentTime();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const accountQuery = accountSearch.trim().toLowerCase();
  const visibleUsers = useMemo(() => {
    if (!accountQuery) return data.users;
    return data.users.filter((user) =>
      [user.display_name, user.email, user.status, ...user.roles]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(accountQuery)),
    );
  }, [accountQuery, data.users]);
  const visibleProfessionals = useMemo(
    () => visibleUsers.filter((user) => user.roles.includes("professional")),
    [visibleUsers],
  );
  const [selection, setSelection] = useState<{
    type: "user" | "post" | "review" | "appeal" | "report";
    id: string;
    name: string;
  } | null>(null);
  const decisionRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (selection) {
      decisionRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
      decisionRef.current?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
    }
  }, [selection]);
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
          ref={decisionRef}
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
              await requireAdminResponse(response, "Change was not saved. Check your access and try again.");
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
      <h2 id="users" className="admin-section-title">App Users</h2>
      <label className="admin-account-search">
        <span>Search users and professionals</span>
        <input
          type="search"
          value={accountSearch}
          onChange={(event) => setAccountSearch(event.target.value)}
          placeholder="Name, email, role or status"
          autoComplete="off"
        />
        <small>{visibleUsers.length} of {data.users.length} accounts shown</small>
      </label>
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
            {visibleUsers.map((user) => (
              <tr key={user.id} id={`user-${user.id}`}>
                <td>{user.display_name}</td>
                <td>{user.email}</td>
                <td>{user.roles.join(", ")}</td>
                <td>
                  {user.deleted_at
                    ? "deleted"
                    : user.restricted_until && Date.parse(user.restricted_until) > now
                      ? `restricted until ${new Date(user.restricted_until).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
                      : user.status}
                </td>
                <td>
                  <div className="admin-user-action-stack">
                    {user.roles.includes("admin") || user.roles.includes("owner") ? (
                      <span>{user.roles.includes("owner") ? "Owner protected" : "Operator managed"}</span>
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
                        Manage status
                      </button>
                    )}
                    {owner && <OwnerUserActions user={user} hardDeleteConfigured={hardDeleteConfigured} />}
                  </div>
                </td>
              </tr>
            ))}
            {!visibleUsers.length && (
              <tr><td colSpan={5}>{accountQuery ? "No accounts match your search." : "No accounts found."}</td></tr>
            )}
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
            {visibleProfessionals.map((user) => (
                <tr key={user.id} id={`professional-user-${user.id}`}>
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
            {!visibleProfessionals.length && (
              <tr><td colSpan={5}>{accountQuery ? "No professionals match your search." : "No professional accounts have been created yet."}</td></tr>
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
          <article className="service-edit-row" id={`professional-${pro.id}`} key={pro.id}>
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
                await requireAdminResponse(response, "LIVE access decision was not saved.");
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
              <input name="restrictedUntil" defaultValue={pro.live_restricted_until ? new Date(new Date(pro.live_restricted_until).getTime() - new Date(pro.live_restricted_until).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ""} type="datetime-local" aria-label={`LIVE restriction end for ${pro.business_name}`} />
              <input name="reason" required minLength={5} maxLength={500} placeholder="Reason for decision" aria-label={`Decision reason for ${pro.business_name}`} />
              <button disabled={busy}>Save LIVE access</button>
            </form>
          </article>
        ))}
        {data.unavailableSections?.includes("professionalTrust") ? <AdminSectionUnavailable label="Professional verification" /> : !data.professionalTrust?.length && <p className="lead">No professional profiles are available yet.</p>}
      </div>
      <h2 id="bookings" className="admin-section-title">Booking overview</h2>
      <div className="service-edit-list">
        {data.bookings?.map((booking) => (
          <article className="service-edit-row" id={`booking-${booking.id}`} key={booking.id}>
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
      <h2 id="payment-disputes" className="admin-section-title">Booking payment disputes</h2>
      <p className="admin-section-intro">
        Read-only Stripe dispute oversight. Provider outcomes are synchronized
        from signed payment events and cannot be manually overridden here.
      </p>
      <div className="service-edit-list">
        {data.bookingDisputes?.map((dispute) => {
          const booking = data.bookings?.find(
            (item) => item.id === dispute.booking_id,
          );
          const reserved =
            dispute.reserved_pending_pence + dispute.reserved_available_pence;
          return (
            <article className="service-edit-row" key={dispute.id}>
              <div>
                <h3>
                  {booking
                    ? `${booking.service_name} · ${booking.professional_name}`
                    : `Booking ${dispute.booking_id.slice(0, 8)}`}
                </h3>
                <p>
                  {booking ? `${booking.customer_name} · ` : ""}
                  {dispute.status.replaceAll("_", " ")}
                </p>
                <small>
                  Disputed: £{(dispute.amount_pence / 100).toFixed(2)} ·
                  Reserved: £{(reserved / 100).toFixed(2)}
                  {dispute.reserve_shortfall_pence > 0
                    ? ` · Shortfall: £${(dispute.reserve_shortfall_pence / 100).toFixed(2)}`
                    : ""}
                </small>
                {dispute.reason && (
                  <small>Reason: {dispute.reason.replaceAll("_", " ")}</small>
                )}
                {dispute.evidence_due_at && (
                  <small>
                    Evidence due:{" "}
                    {new Date(dispute.evidence_due_at).toLocaleString("en-GB", {
                      timeZone: "Europe/London",
                    })}
                  </small>
                )}
                {dispute.response_statement ? (
                  <details>
                    <summary>Professional dispute response</summary>
                    <p>{dispute.response_statement}</p>
                    {dispute.response_updated_at && (
                      <small>
                        Last updated:{" "}
                        {new Date(dispute.response_updated_at).toLocaleString("en-GB", {
                          timeZone: "Europe/London",
                        })}
                      </small>
                    )}
                  </details>
                ) : (
                  <small>No professional response has been submitted yet.</small>
                )}
              </div>
              <span className={`admin-status admin-status-${dispute.status}`}>
                {dispute.status.replaceAll("_", " ")}
              </span>
            </article>
          );
        })}
        {data.unavailableSections?.includes("bookingDisputes") ? <AdminSectionUnavailable label="Booking disputes" /> : !data.bookingDisputes?.length && (
          <p className="lead">No booking payment disputes are recorded.</p>
        )}
      </div>

      <h2 id="orders" className="admin-section-title">Shop order oversight</h2>
      <p className="admin-section-intro">
        Read-only marketplace oversight for support and operational review.
        Sellers manage fulfilment; payment and refund states remain protected.
      </p>
      {data.shopOrders ? (
        <>
          <div className="analytics-grid admin-order-metrics">
            <article>
              <strong>{data.shopOrders.counts.total}</strong>
              <span>Total shop orders</span>
            </article>
            <article>
              <strong>{data.shopOrders.counts.processing}</strong>
              <span>Processing</span>
            </article>
            <article>
              <strong>{data.shopOrders.counts.shipped}</strong>
              <span>Shipped</span>
            </article>
            <article>
              <strong>{data.shopOrders.counts.refundPending}</strong>
              <span>Refund pending</span>
            </article>
            <article>
              <strong>{data.shopOrders.counts.awaitingShipmentOver24h}</strong>
              <span>Awaiting shipment 24h+</span>
            </article>
          </div>
          <div className="service-edit-list">
            {data.shopOrders.orders.map((order) => (
              <article className="service-edit-row admin-shop-order" key={order.id}>
                <div>
                  <h3>{order.professional_name} · £{(order.total_pence / 100).toFixed(2)}</h3>
                  <p>
                    {order.recipient_name} · {order.city} {order.postcode} · {order.status}
                  </p>
                  {order.awaiting_shipment_over_24h && (
                    <small className="pro-dispute-warning">
                      Fulfilment attention: this paid order has been waiting more than 24 hours without shipment.
                    </small>
                  )}
                  <small>
                    {order.items.length
                      ? order.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(" · ")
                      : "No item rows recorded"}
                  </small>
                  {(order.tracking_carrier || order.tracking_number) && (
                    <small>
                      Tracking: {order.tracking_carrier || "Carrier"} · {order.tracking_number || "Pending"}
                    </small>
                  )}
                  <small>
                    {new Date(order.created_at).toLocaleString("en-GB", {
                      timeZone: "Europe/London",
                    })}
                  </small>
                </div>
                <span className={`admin-status admin-status-${order.status}`}>
                  {order.status.replace("_", " ")}
                </span>
              </article>
            ))}
            {!data.shopOrders.orders.length && (
              <p className="lead">No paid Shop orders exist yet.</p>
            )}
          </div>
        </>
      ) : (
        <AdminSectionUnavailable label="Shop order oversight" />
      )}
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
        <AdminSectionUnavailable label="Safety reports" />
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
