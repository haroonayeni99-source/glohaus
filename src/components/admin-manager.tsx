"use client";
import { AdminSection } from "@/components/admin-workspace-view";
import { requireAdminResponse } from "@/lib/admin-response";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentTime } from "@/components/use-current-time";
import { useRouter } from "next/navigation";
import type { AdminOverview } from "@/modules/admin/repository";
import { OwnerUserActions } from "@/components/owner-user-actions";
import { AdminSectionUnavailable } from "@/components/admin-section-unavailable";
export function AdminManager({
  data,
  owner = false,
  hardDeleteConfigured = false,
}: {
  data: AdminOverview;
  owner?: boolean;
  hardDeleteConfigured?: boolean;
}) {
  const router = useRouter();
  const now = useCurrentTime();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountView, setAccountView] = useState("current");
  useEffect(() => {
    const clear = () => {
      setAccountSearch("");
      setAccountView("all");
    };
    window.addEventListener("glohaus:admin-search-reveal", clear);
    return () =>
      window.removeEventListener("glohaus:admin-search-reveal", clear);
  }, []);
  const accountQuery = accountSearch.trim().toLowerCase();
  const visibleUsers = useMemo(() => {
    return data.users.filter(
      (user) =>
        (accountView === "all" ||
          (accountView === "deleted"
            ? Boolean(user.deleted_at)
            : accountView === "hidden"
              ? !user.deleted_at && Boolean(user.public_hidden_at)
              : !user.deleted_at)) &&
        (!accountQuery ||
          [
            user.display_name,
            user.business_name,
            user.email,
            user.status,
            ...user.roles,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(accountQuery),
            )),
    );
  }, [accountQuery, accountView, data.users]);
  const visibleProfessionals = useMemo(
    () => data.users.filter((user) => user.roles.includes("professional")),
    [data.users],
  );
  const [selection, setSelection] = useState<{
    type: "user" | "post" | "review" | "reviewResponse" | "appeal" | "report";
    id: string;
    name: string;
  } | null>(null);
  const decisionRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (selection) {
      decisionRef.current?.scrollIntoView({
        block: "center",
        behavior: "instant",
      });
      decisionRef.current
        ?.querySelector<HTMLSelectElement>("select")
        ?.focus({ preventScroll: true });
    }
  }, [selection]);
  return (
    <>
      <div className="analytics-grid admin-manager-summary">
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
      <p className="lead admin-manager-summary">
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
          className="editor-form admin-decision-form"
          data-admin-decision
          data-admin-refund={selection.type === "appeal" ? "true" : undefined}
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
              await requireAdminResponse(
                response,
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
      <AdminSection id="users" title="Users" search={false}>
        <p>
          Hide an account and its public content, show it again, or delete its
          GLOHAUS access. Booking, payment and audit history is retained.
        </p>
        <label className="admin-account-search">
          <span>Show accounts</span>
          <select
            value={accountView}
            onChange={(event) => setAccountView(event.target.value)}
          >
            <option value="current">Current accounts</option>
            <option value="hidden">Hidden content</option>
            <option value="deleted">Deleted accounts</option>
            <option value="all">All accounts</option>
          </select>
        </label>
        <label className="admin-account-search">
          <span>Search users and professionals</span>
          <input
            type="search"
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Name, business, email, role or status"
            autoComplete="off"
          />
          <small>
            {visibleUsers.length} of {data.users.length} accounts shown
          </small>
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
                  <td>
                    {user.display_name}
                    {user.business_name && (
                      <small style={{ display: "block" }}>{user.business_name}</small>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>{user.roles.join(", ")}</td>
                  <td>
                    {user.deleted_at
                      ? "deleted"
                      : user.restricted_until &&
                          Date.parse(user.restricted_until) > now
                        ? `restricted until ${new Date(user.restricted_until).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
                        : user.status}
                    {!user.deleted_at && user.public_hidden_at && (
                      <small style={{ display: "block" }}>Public content hidden</small>
                    )}
                  </td>
                  <td>
                    <div className="admin-user-action-stack">
                      {user.deleted_at ? (
                        <span>Access removed</span>
                      ) : user.roles.includes("admin") ||
                        user.roles.includes("owner") ? (
                        <span>
                          {user.roles.includes("owner")
                            ? "Owner protected"
                            : "Operator managed"}
                        </span>
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
                      {owner && (
                        <OwnerUserActions
                          user={user}
                          hardDeleteConfigured={hardDeleteConfigured}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleUsers.length && (
                <tr>
                  <td colSpan={5}>
                    {accountQuery
                      ? "No accounts match. Try a name or email, or clear your search."
                      : "No accounts yet. Customer and professional accounts will appear here after setup."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminSection>
      <AdminSection
        id="professionals"
        title="Professional management"
        search={true}
      >
        <p className="admin-section-intro">
          These are the accounts currently authorised to manage a GLOHAUS PRO
          business. Status changes use the same audited server-side action as
          account management.
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
                  <td>
                    <span
                      className={`admin-status admin-status-${user.status}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>
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
                  </td>
                </tr>
              ))}
              {!visibleProfessionals.length && (
                <tr>
                  <td colSpan={5}>
                    No professional accounts have been created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminSection>
      <AdminSection
        id="live-access"
        title="Professional verification & LIVE access"
        search={true}
      >
        <p className="admin-section-intro">
          Verification and LIVE restrictions are server-controlled and every
          change requires a reason for the audit log.
        </p>
        <div className="service-edit-list">
          {data.professionalTrust?.map((pro) => (
            <article
              className="service-edit-row"
              id={`professional-${pro.id}`}
              key={pro.id}
            >
              <div>
                <h3>{pro.business_name}</h3>
                <p>
                  Verification: {pro.verification_status} · Standing:{" "}
                  {pro.standing_status}
                </p>
                <small>
                  {pro.live_restricted_until
                    ? `LIVE restricted until ${new Date(pro.live_restricted_until).toLocaleString("en-GB")}`
                    : "No timed LIVE restriction"}
                </small>
              </div>
              <form
                onSubmit={async (event) => {
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
                        badges: {
                          identity: form.get("identityVerified") === "on",
                          business: form.get("businessVerified") === "on",
                          professional:
                            form.get("professionalVerified") === "on",
                        },
                        standing: form.get("standing"),
                        restrictedUntil: form.get("restrictedUntil")
                          ? new Date(
                              String(form.get("restrictedUntil")),
                            ).toISOString()
                          : null,
                        reason: form.get("reason"),
                      }),
                    });
                    await requireAdminResponse(
                      response,
                      "LIVE access decision was not saved.",
                    );
                    setNotice(
                      "Professional verification/LIVE decision saved and audited.",
                    );
                    router.refresh();
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "Could not save.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <select
                  name="verification"
                  defaultValue={pro.verification_status}
                  aria-label={`Verification for ${pro.business_name}`}
                >
                  {["unverified", "pending", "verified", "rejected"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
                <fieldset className="admin-verification-checks">
                  <legend>Approved verification checks</legend>
                  <label>
                    <input
                      type="checkbox"
                      name="identityVerified"
                      defaultChecked={
                        pro.identity_verified ||
                        pro.verification_status === "verified"
                      }
                    />
                    Identity verified
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="businessVerified"
                      defaultChecked={pro.business_verified === true}
                    />
                    Business verified
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="professionalVerified"
                      defaultChecked={pro.professional_verified === true}
                    />
                    Professional verified
                  </label>
                  <small>
                    Approve each check after reviewing evidence. Business and
                    professional checks require identity verification.
                  </small>
                </fieldset>
                <select
                  name="standing"
                  defaultValue={pro.standing_status}
                  aria-label={`Standing for ${pro.business_name}`}
                >
                  <option value="good">good</option>
                  <option value="restricted">restricted</option>
                </select>
                <input
                  name="restrictedUntil"
                  defaultValue={
                    pro.live_restricted_until
                      ? new Date(
                          new Date(pro.live_restricted_until).getTime() -
                            new Date(
                              pro.live_restricted_until,
                            ).getTimezoneOffset() *
                              60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  type="datetime-local"
                  aria-label={`LIVE restriction end for ${pro.business_name}`}
                />
                <input
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Reason for decision"
                  aria-label={`Decision reason for ${pro.business_name}`}
                />
                <button disabled={busy}>Save LIVE access</button>
              </form>
            </article>
          ))}
          {data.unavailableSections?.includes("professionalTrust") ? (
            <AdminSectionUnavailable label="Professional verification" />
          ) : (
            !data.professionalTrust?.length && (
              <p className="lead">
                No professionals yet. Verification and LIVE controls will appear
                here when a professional sets up their profile.
              </p>
            )
          )}
        </div>
      </AdminSection>
      <AdminSection id="bookings" title="Booking overview" search={true}>
        <div className="service-edit-list">
          {data.bookings?.map((booking) => (
            <article
              className="service-edit-row"
              id={`booking-${booking.id}`}
              key={booking.id}
            >
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
          {data.bookings?.length === 0 && (
            <p className="lead">
              No bookings yet. Customer bookings and their status will appear
              here.
            </p>
          )}
        </div>
      </AdminSection>
      <AdminSection
        id="payment-disputes"
        title="Booking payment disputes"
        search={true}
      >
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
                      {new Date(dispute.evidence_due_at).toLocaleString(
                        "en-GB",
                        {
                          timeZone: "Europe/London",
                        },
                      )}
                    </small>
                  )}
                  {dispute.response_statement ? (
                    <details>
                      <summary>Professional dispute response</summary>
                      <p>{dispute.response_statement}</p>
                      {dispute.response_updated_at && (
                        <small>
                          Last updated:{" "}
                          {new Date(dispute.response_updated_at).toLocaleString(
                            "en-GB",
                            {
                              timeZone: "Europe/London",
                            },
                          )}
                        </small>
                      )}
                    </details>
                  ) : (
                    <small>
                      No professional response has been submitted yet.
                    </small>
                  )}
                </div>
                <span className={`admin-status admin-status-${dispute.status}`}>
                  {dispute.status.replaceAll("_", " ")}
                </span>
              </article>
            );
          })}
          {data.unavailableSections?.includes("bookingDisputes") ? (
            <AdminSectionUnavailable label="Booking disputes" />
          ) : (
            !data.bookingDisputes?.length && (
              <p className="lead">No booking payment disputes are recorded.</p>
            )
          )}
        </div>
      </AdminSection>
      <AdminSection id="orders" title="Shop order oversight" search={true}>
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
                <strong>
                  {data.shopOrders.counts.awaitingShipmentOver24h}
                </strong>
                <span>Awaiting shipment 24h+</span>
              </article>
            </div>
            <div className="service-edit-list">
              {data.shopOrders.orders.map((order) => (
                <article
                  className="service-edit-row admin-shop-order"
                  key={order.id}
                >
                  <div>
                    <h3>
                      {order.professional_name} · £
                      {(order.total_pence / 100).toFixed(2)}
                    </h3>
                    <p>
                      {order.recipient_name} · {order.city} {order.postcode} ·{" "}
                      {order.status}
                    </p>
                    {order.awaiting_shipment_over_24h && (
                      <small className="pro-dispute-warning">
                        Fulfilment attention: this paid order has been waiting
                        more than 24 hours without shipment.
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
                        Tracking: {order.tracking_carrier || "Carrier"} ·{" "}
                        {order.tracking_number || "Pending"}
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
      </AdminSection>
      <AdminSection id="refund-appeals" title="Refund appeals">
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
      </AdminSection>
      <AdminSection id="reviews" title="Review moderation" search={true}>
        <div className="service-edit-list">
          {data.reviews?.map((review) => (
            <article className="service-edit-row" key={review.id}>
              <div>
                <h3>
                  {review.public_name} · {review.rating}/5
                </h3>
                <p>{review.body}</p>
                {review.response_body&&<><p>Professional response ({review.response_status}): {review.response_body}</p><button onClick={()=>setSelection({type:"reviewResponse",id:review.id,name:"Professional response"})}>Moderate response</button></>}
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
          {data.reviews?.length === 0 && (
            <p className="lead">
              No reviews yet. Reviews from completed bookings will appear here
              for moderation.
            </p>
          )}
        </div>
      </AdminSection>
      <AdminSection id="reports" title="Safety reports" search={true}>
        {data.safety ? (
          <>
            <div className="analytics-grid admin-report-metrics">
              <article>
                <strong>{data.safety.counts.open}</strong>
                <span>Open reports</span>
              </article>
              <article>
                <strong>{data.safety.counts.underReview}</strong>
                <span>Under review</span>
              </article>
              <article>
                <strong>{data.safety.counts.resolved}</strong>
                <span>Resolved</span>
              </article>
            </div>
            <div className="service-edit-list">
              {data.safety.reports.map((report) => (
                <article className="service-edit-row" key={report.id}>
                  <div>
                    <h3>
                      {report.category} · {report.target_type}
                    </h3>
                    <p>{report.description}</p>
                    <small>
                      {report.reporter_name} · {report.status}
                    </small>
                  </div>
                  {!["resolved", "dismissed"].includes(report.status) && (
                    <button
                      onClick={() =>
                        setSelection({
                          type: "report",
                          id: report.id,
                          name: `${report.category} report`,
                        })
                      }
                    >
                      Review
                    </button>
                  )}
                </article>
              ))}
              {!data.safety.reports.length && (
                <p className="lead">No safety reports need review.</p>
              )}
            </div>
          </>
        ) : (
          <AdminSectionUnavailable label="Safety reports" />
        )}
      </AdminSection>
      <AdminSection id="content" title="Content moderation" search={true}>
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
          {!data.posts.length && (
            <p className="lead">
              No posts yet. Professional posts will appear here for moderation.
            </p>
          )}
        </div>
      </AdminSection>
    </>
  );
}
