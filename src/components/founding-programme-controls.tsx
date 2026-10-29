"use client";
import { AdminToolHelp } from "@/components/admin-tool-guide";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProgrammeOverview } from "@/modules/commission/programme";
export function FoundingProgrammeControls({
  data,
  view = "all",
}: {
  data: ProgrammeOverview | null;
  view?: "all" | "programme" | "pricing";
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    const action = String(f.get("action"));
    const body: Record<string, unknown> = {
      action,
      reason: String(f.get("reason")),
      confirmed: f.get("confirmed") === "yes",
    };
    if (action === "retire") body.confirmation = String(f.get("confirmation"));
    if (action === "pricing_draft")
      for (const key of [
        "professionalBasisPoints",
        "platformFirstBasisPoints",
        "returningBasisPoints",
      ])
        body[key] = Math.round(Number(f.get(key)) * 100);
    try {
      const response = await fetch("/api/v1/admin/founding-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.code === "PROGRAMME_RETIRED"
            ? "The programme is permanently retired and cannot be reopened."
            : "Could not save. Check your confirmation and Owner MFA, then try again.",
        );
      setNotice(
        action === "pricing_draft"
          ? "Draft saved. Live pricing is unchanged."
          : "Programme status saved. Existing benefits remain valid until expiry.",
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <p role="alert">
        Programme controls are unavailable. No status or pricing has been
        changed.
      </p>
    );
  const retired = data.programme.state === "retired";
  return (
    <div className="commission-centre">
      {notice && <p role="status">{notice}</p>}
      {view !== "pricing" && (
        <section
          id={view === "all" ? "founding-programme" : undefined}
          className="commission-box"
        >
          <h3>Founding Programme Controls</h3>
          <AdminToolHelp id="founding-programme" />
          <p>
            <strong>Status: {data.programme.state}</strong>
          </p>
          <p>
            New participants receive 14 days at 0% GLOHAUS service commission only.
            Previously promised extensions remain protected. Optional feedback does not extend new offers. Processing
            and customer booking fees remain separate.
          </p>
          <p>
            Closing stops new enrolments and hides public offers. You can
            reopen. Retirement is permanent. Both preserve existing benefits,
            feedback eligibility and historical records. Normal professional
            registration continues.
          </p>
          {!retired && (
            <form onSubmit={submit} className="editor-form">
              <input
                type="hidden"
                name="action"
                value={data.programme.state === "open" ? "close" : "open"}
              />
              <label>
                Reason
                <input name="reason" required minLength={5} maxLength={500} />
              </label>
              <label>
                <input type="checkbox" name="confirmed" value="yes" required />{" "}
                I confirm this programme status change.
              </label>
              <button disabled={busy} className="button">
                {data.programme.state === "open"
                  ? "Close programme"
                  : "Open programme"}
              </button>
            </form>
          )}
          {!retired && (
            <details>
              <summary>Permanently Retire Programme</summary>
              <p>
                This cannot be undone through the dashboard. All new founding
                enrolments will stop.
              </p>
              <form onSubmit={submit} className="editor-form">
                <input type="hidden" name="action" value="retire" />
                <label>
                  Reason
                  <input name="reason" required minLength={5} maxLength={500} />
                </label>
                <label>
                  Type PERMANENTLY RETIRE FOUNDING PROGRAMME
                  <input
                    name="confirmation"
                    required
                    autoComplete="off"
                    pattern="PERMANENTLY RETIRE FOUNDING PROGRAMME"
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                  />{" "}
                  I understand retirement is permanent and existing benefits are
                  protected.
                </label>
                <button disabled={busy} className="button danger">
                  Permanently retire programme
                </button>
              </form>
            </details>
          )}
        </section>
      )}
      {view !== "programme" && (
        <section className="commission-box">
          <h3>Customer-source pricing proposals</h3>
          <p>
            <strong>Draft only — inactive.</strong> These rates cannot change
            live bookings, commission, wallet balances or payouts. A future
            release and advance pricing notices are required before activation.
          </p>
          <form onSubmit={submit} className="editor-form commission-grid">
            <input type="hidden" name="action" value="pricing_draft" />
            {(
              [
                [
                  "professionalBasisPoints",
                  "Professional-sourced customers",
                  data.pricingDraft.professional_basis_points,
                ],
                [
                  "platformFirstBasisPoints",
                  "GLOHAUS-acquired first booking",
                  data.pricingDraft.platform_first_basis_points,
                ],
                [
                  "returningBasisPoints",
                  "Returning customers",
                  data.pricingDraft.returning_basis_points,
                ],
              ] as const
            ).map(([key, label, bp]) => (
              <label key={key}>
                {label} (%)
                <input
                  name={key}
                  type="number"
                  min={0}
                  max={50}
                  step="0.01"
                  required
                  defaultValue={bp / 100}
                />
              </label>
            ))}
            <label>
              Reason
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <label>
              <input type="checkbox" name="confirmed" value="yes" required />{" "}
              Save proposals only; keep live pricing unchanged.
            </label>
            <button disabled={busy} className="button">
              Save draft rates
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
