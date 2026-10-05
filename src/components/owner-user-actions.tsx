"use client";

import { useState } from "react";
import { useCurrentTime } from "@/components/use-current-time";
import { useRouter } from "next/navigation";

type UserRow = {
  id: string;
  display_name: string;
  email: string;
  roles: string[];
  restricted_until: string | null;
  restriction_reason: string | null;
  deleted_at: string | null;
};

const durations = [
  ["1 hour", 1],
  ["6 hours", 6],
  ["24 hours", 24],
  ["3 days", 72],
  ["7 days", 168],
  ["30 days", 720],
] as const;

export function OwnerUserActions({ user, hardDeleteConfigured }: { user: UserRow; hardDeleteConfigured: boolean }) {
  const router = useRouter();
  const now = useCurrentTime();
  const [mode, setMode] = useState<"restrict" | "delete" | null>(null);
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
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "Owner account action was not saved.",
        );
      }
      setNotice("Saved and added to the Owner audit log.");
      setMode(null);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (user.roles.includes("owner")) return <span>Owner protected</span>;
  if (user.deleted_at) return <span>Deleted</span>;

  return (
    <div className="owner-user-actions">
      <div className="owner-user-action-buttons">
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
        <button
          className="owner-danger-button"
          type="button"
          disabled={!hardDeleteConfigured || busy}
          title={
            hardDeleteConfigured
              ? "Delete this account"
              : "Secure Supabase admin deletion is not configured yet."
          }
          onClick={() => setMode("delete")}
        >
          {hardDeleteConfigured ? "Delete" : "Delete unavailable"}
        </button>
      </div>

      {!hardDeleteConfigured && (
        <small className="form-notice">
          Hard delete needs a server-only Supabase admin key. Restrict and status controls still work normally.
        </small>
      )}
      {notice && <small className="form-notice">{notice}</small>}

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
            <button className="button" disabled={busy}>Apply restriction</button>
            <button type="button" onClick={() => setMode(null)}>Cancel</button>
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
            });
          }}
        >
          <strong>Delete {user.display_name}?</strong>
          <p>
            This removes Supabase sign-in access and anonymises the GLOHAUS
            account. Booking, payment and audit records are retained for
            operational and financial integrity.
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
            <button type="button" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
