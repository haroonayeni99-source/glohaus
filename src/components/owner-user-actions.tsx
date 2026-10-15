"use client";

import { useState } from "react";
import { useCurrentTime } from "@/components/use-current-time";
import { useRouter } from "next/navigation";
import { requireAdminResponse } from "@/lib/admin-response";

type UserRow = {
  id: string;
  display_name: string;
  email: string;
  roles: string[];
  restricted_until: string | null;
  restriction_reason: string | null;
  deleted_at: string | null;
  public_hidden_at?: string | null;
  auth_cleanup_pending?: boolean;
};

const durations = [
  ["1 hour", 1],
  ["6 hours", 6],
  ["24 hours", 24],
  ["3 days", 72],
  ["7 days", 168],
  ["30 days", 720],
] as const;

export function OwnerUserActions({
  user,
  hardDeleteConfigured,
}: {
  user: UserRow;
  hardDeleteConfigured: boolean;
}) {
  const router = useRouter();
  const now = useCurrentTime();
  const [mode, setMode] = useState<
    "restrict" | "delete" | "hide" | "show" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const restricted =
    user.restricted_until !== null &&
    Number.isFinite(Date.parse(user.restricted_until)) &&
    Date.parse(user.restricted_until) > now;

  async function submit(body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/owner-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response
        .clone()
        .json()
        .catch(() => ({}));
      if (!response.ok) {
        await requireAdminResponse(
          response,
          typeof result?.message === "string"
            ? result.message
            : "Owner account action was not saved.",
        );
      }
      setNotice(result.message || "Saved and added to the Owner audit log.");
      setMode(null);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (user.roles.includes("owner")) return <span>Owner protected</span>;

  return (
    <div className="owner-user-actions">
      <div className="owner-user-action-buttons">
        {user.deleted_at ? (
          <span>Deleted from GLOHAUS</span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(user.public_hidden_at ? "show" : "hide")}
            >
              {user.public_hidden_at
                ? "Show account & content"
                : "Hide account & content"}
            </button>
            {restricted ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void submit({
                    action: "liftRestriction",
                    userId: user.id,
                    reason: "Owner manually lifted timed account restriction",
                  })
                }
              >
                Lift restriction
              </button>
            ) : (
              <button type="button" onClick={() => setMode("restrict")}>
                Restrict
              </button>
            )}
          </>
        )}
        {(!user.deleted_at ||
          (user.auth_cleanup_pending && hardDeleteConfigured)) && (
          <button
            className="owner-danger-button"
            type="button"
            disabled={busy}
            title="Delete this GLOHAUS account and hide its public content"
            onClick={() => setMode("delete")}
          >
            {user.deleted_at ? "Finish sign-in cleanup" : "Delete"}
          </button>
        )}
      </div>

      {user.deleted_at && user.auth_cleanup_pending && (
        <small className="form-notice">
          Access is blocked and public content is hidden. Sign-in record cleanup
          is pending.
        </small>
      )}
      {notice && <small className="form-notice">{notice}</small>}

      {(mode === "hide" || mode === "show") && (
        <form
          className="owner-account-action-popover"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void submit({
              action: mode,
              userId: user.id,
              reason: form.get("reason"),
            });
          }}
        >
          <strong>
            {mode === "hide" ? "Hide" : "Show"} {user.display_name} and public
            content?
          </strong>
          <p>
            {mode === "hide"
              ? "Hide the profile, services, products, posts, stories, images, videos and public reviews. Sign-in and existing bookings remain available. New incoming bookings and purchases are blocked while hidden."
              : "Restore account visibility. Existing draft, inactive and moderated content stays unpublished; ended LIVE sessions are not restarted."}
          </p>
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          <div className="editor-actions">
            <button className="button" disabled={busy}>
              {mode === "hide"
                ? "Hide account & content"
                : "Show account & content"}
            </button>
            <button type="button" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "restrict" && (
        <form
          className="owner-account-action-popover"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const hours = Number(form.get("duration"));
            const until = new Date(Date.now() + hours * 60 * 60 * 1000);
            void submit({
              action: "restrict",
              userId: user.id,
              restrictedUntil: until.toISOString(),
              reason: form.get("reason"),
            });
          }}
        >
          <strong>Temporarily restrict {user.display_name}</strong>
          <label>
            Restriction length
            <select name="duration" defaultValue="24" required>
              {durations.map(([label, hours]) => (
                <option key={hours} value={hours}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              placeholder="Reason shown in the Owner audit log"
            />
          </label>
          <small>
            Access lifts automatically when the selected time expires.
          </small>
          <div className="editor-actions">
            <button className="button" disabled={busy}>
              Apply restriction
            </button>
            <button type="button" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <form
          className="owner-account-action-popover owner-delete-panel"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (form.get("confirmation") !== "DELETE") {
              setNotice("Type DELETE exactly to confirm.");
              return;
            }
            void submit({
              action: "delete",
              userId: user.id,
              reason: form.get("reason"),
              confirmation: "DELETE",
            });
          }}
        >
          <strong>Delete {user.display_name}?</strong>
          <p>
            This permanently removes GLOHAUS access and hides all public
            content. Booking, payment and audit records are retained. Sign-in
            credentials are also removed when provider cleanup is available;
            access is blocked immediately.
          </p>
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          <label>
            Type DELETE to confirm
            <input name="confirmation" required autoComplete="off" />
          </label>
          <div className="editor-actions">
            <button className="owner-danger-button" disabled={busy}>
              Delete account
            </button>
            <button type="button" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
