"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerProfessionalCommission } from "@/modules/admin/repository";

function percent(bps: number) {
  return (bps / 100).toFixed(2);
}

export function ProfessionalCommissionControl({
  professionals,
}: {
  professionals: OwnerProfessionalCommission[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>, professionalId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("percentage") || "").trim();
    setBusyId(professionalId);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/professional-commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          percentage: raw === "" ? null : Number(raw),
          expiresAt: String(form.get("expiresAt") || "").trim() || null,
          reason: form.get("reason"),
        }),
      });
      if (!response.ok) throw new Error("Commission change was not saved.");
      setNotice(raw === "" ? "Custom commission removed; the normal plan rate now applies." : "Custom commission saved for future booking quotes.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save commission.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <div className="service-edit-list">
        {professionals.map((pro) => (
          <article className="service-edit-row" key={pro.professionalId}>
            <div>
              <h3>{pro.businessName}</h3>
              <p>{pro.email} · {pro.planKey} plan</p>
              <small>
                Normal rate {percent(pro.defaultBasisPoints)}% · Effective rate {percent(pro.effectiveBasisPoints)}%
                {pro.overrideBasisPoints !== null ? " · custom owner override active" : ""}
              </small>
            </div>
            <form className="editor-form" onSubmit={(event) => void save(event, pro.professionalId)}>
              <label>
                Custom service commission %
                <input
                  name="percentage"
                  type="number"
                  min={0}
                  max={50}
                  step="0.01"
                  defaultValue={pro.overrideBasisPoints === null ? "" : percent(pro.overrideBasisPoints)}
                  placeholder={`Leave blank for normal ${percent(pro.defaultBasisPoints)}%`}
                />
              </label>
              <label>
                Expiry (optional)
                <input
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={pro.overrideUntil ? new Date(pro.overrideUntil).toISOString().slice(0,16) : ""}
                />
              </label>
              <label>
                Reason
                <input
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  defaultValue={pro.overrideReason || ""}
                  placeholder="e.g. High-volume professional commercial rate"
                />
              </label>
              <button className="button" disabled={busyId === pro.professionalId}>
                {busyId === pro.professionalId ? "Saving…" : pro.overrideBasisPoints === null ? "Set custom rate" : "Update / remove rate"}
              </button>
              <small>To remove an override, clear the percentage and provide a reason.</small>
            </form>
          </article>
        ))}
        {!professionals.length && <p className="lead">No professional accounts are available yet.</p>}
      </div>
    </>
  );
}
