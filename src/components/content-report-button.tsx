"use client";

import { Flag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const categories = [
  "Spam or misleading",
  "Inappropriate content",
  "Privacy or consent",
  "Harassment",
  "Unsafe or illegal",
  "Other",
];

export function ContentReportButton({
  targetType,
  targetId,
  label = "Report",
}: {
  targetType: "post" | "media";
  targetId: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <>
      <button
        type="button"
        className="content-report-trigger"
        onClick={() => {
          setNotice("");
          setOpen(true);
        }}
        aria-label={label}
      >
        <Flag size={17} aria-hidden />
        <span>{label}</span>
      </button>

      {open && (
        <div className="content-report-backdrop" role="presentation">
          <form
            className="content-report-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Report content"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setNotice("");
              try {
                const response = await fetch("/api/v1/reports", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    targetType,
                    targetId,
                    category: form.get("category"),
                    description: form.get("description"),
                  }),
                });
                if (response.status === 401) {
                  const returnTo =
                    window.location.pathname +
                    window.location.search +
                    window.location.hash;
                  router.push(
                    `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
                  );
                  return;
                }
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                  if (payload?.error?.code === "REPORT_ALREADY_OPEN")
                    throw new Error("You already have an open report for this content.");
                  throw new Error("Your report could not be submitted.");
                }
                setNotice("Report submitted for GLOHAUS review.");
                event.currentTarget.reset();
              } catch (error) {
                setNotice(
                  error instanceof Error ? error.message : "Could not submit report.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <button
              type="button"
              className="content-report-close"
              aria-label="Close report form"
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden />
            </button>
            <p className="eyebrow">GLOHAUS SAFETY</p>
            <h2>Report this content</h2>
            <p>
              Tell us what is wrong. Reports go to the GLOHAUS moderation queue.
            </p>
            <label>
              Reason
              <select name="category" required defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Details
              <textarea
                name="description"
                minLength={5}
                maxLength={1000}
                required
                placeholder="Briefly explain what should be reviewed."
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Submitting…" : "Submit report"}
            </button>
            {notice && <p className="form-notice" role="status">{notice}</p>}
          </form>
        </div>
      )}
    </>
  );
}
