"use client";
import { useState } from "react";
import type { RegulatoryOverview } from "@/modules/taxonomy/regulatory";

export function OwnerServiceSafeguards({
  professionals,
}: {
  professionals: { id: string; business_name: string }[];
}) {
  const [data, setData] = useState<RegulatoryOverview | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const category = data?.categories.find((c) => c.id === categoryId);
  const approval = data?.approvals.find(
    (a) => a.category_id === categoryId && a.professional_id === professionalId,
  );

  async function read() {
    const response = await fetch("/api/v1/admin/service-safeguards", {
      cache: "no-store",
    });
    if (!response.ok)
      throw Error(
        "Could not load provider checks. Refresh your Owner verification and try again.",
      );
    const next: RegulatoryOverview = await response.json();
    setData(next);
    setCategoryId((current) => current || next.categories[0]?.id || "");
    setRefreshNeeded(false);
  }
  async function load() {
    setBusy(true);
    setNotice("");
    try {
      await read();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load checks.",
      );
      setRefreshNeeded(true);
    } finally {
      setBusy(false);
    }
  }
  async function save(input: unknown, revoke = false) {
    if (
      !window.confirm(
        revoke
          ? "Revoke this provider’s approval for new bookings? Existing bookings and history are preserved."
          : "Record this provider approval after checking the evidence? The category must also be open before bookings are available.",
      )
    )
      return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/service-safeguards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok)
        throw Error(
          "Approval was not saved. Check the evidence, expiry date, professional verification and your Owner verification.",
        );
      setNotice(
        revoke
          ? "Approval revoked. New bookings are blocked."
          : "Provider approval saved. Opening the category is a separate Owner decision.",
      );
      try {
        await read();
      } catch {
        setRefreshNeeded(true);
        setNotice(
          "Your decision was saved, but the list could not refresh. Refresh the list before making another decision.",
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save the decision.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Future service safeguards"
      className="admin-detail-card"
    >
      <h3>Future services: provider checks</h3>
      <p>
        Teeth Whitening and Tattoos start hidden. Open or hide them using the
        category controls above. Opening a category does not approve its
        professionals.
      </p>
      <p>
        Only the Owner can open these categories or record approvals. New
        bookings require current provider approval and the platform’s existing
        professional verification.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        {data ? "Refresh provider checks" : "Open provider checks"}
      </button>
      {notice && <p role="status">{notice}</p>}
      {refreshNeeded && (
        <p>
          Use “Refresh provider checks” to reload. The saved decision will not
          be sent again.
        </p>
      )}
      {data && (
        <>
          <div className="field-grid">
            <label>
              Future category
              <select
                disabled={busy}
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setNotice("");
                }}
              >
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.active ? "Open" : "Hidden"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Professional
              <select
                disabled={busy}
                value={professionalId}
                onChange={(event) => {
                  setProfessionalId(event.target.value);
                  setNotice("");
                }}
              >
                <option value="">Choose a professional</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.business_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {category?.kind === "dentistry" ? (
            <p>
              Initial launch is limited to GDC-registered dentists. Check the{" "}
              <a
                href="https://olr.gdc-uk.org/"
                target="_blank"
                rel="noreferrer"
              >
                GDC register
              </a>
              , appropriate insurance, training and clinical assessment/consent
              arrangements. Other dental roles need a separate
              prescription/supervision workflow before they can be enabled.
            </p>
          ) : (
            <p>
              Check the provider and premises with the{" "}
              <a
                href="https://www.gov.uk/find-licences/skin-piercing-and-tattooing"
                target="_blank"
                rel="noreferrer"
              >
                relevant local authority
              </a>
              , current insurance, infection-control/hygiene procedures and age
              checks. Requirements vary by location.
            </p>
          )}
          {approval && (
            <p>
              Recorded approval: {approval.status}
              {approval.expired ? " · expired at last refresh" : ""}. Expires{" "}
              {new Date(approval.valid_until).toLocaleDateString("en-GB", {
                timeZone: "Europe/London",
              })}
              . {approval.registration_reference}
            </p>
          )}
          <form
            className="editor-form"
            key={`${categoryId}:${professionalId}`}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void save({
                status: "approved",
                categoryId,
                professionalId,
                registrationReference: form.get("registrationReference"),
                validUntil: form.get("validUntil"),
                reason: form.get("reason"),
                registerChecked: form.get("registerChecked") === "on",
                insuranceChecked: form.get("insuranceChecked") === "on",
                safeguardsChecked: form.get("safeguardsChecked") === "on",
                dentistConfirmed: form.get("dentistConfirmed") === "on",
              });
            }}
          >
            <fieldset disabled={busy || !professionalId || refreshNeeded}>
              <label>
                {category?.kind === "dentistry"
                  ? "GDC registration number"
                  : "Provider and premises registration/licence references"}
                <input
                  name="registrationReference"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                Approval expires
                <input type="date" name="validUntil" required />
              </label>
              <p>
                Use the earliest registration, insurance or review expiry.
                Approval ends at the start of that date in UK time, and cannot
                exceed one year.
              </p>
              <label>
                <input type="checkbox" name="registerChecked" required />I
                checked current registration/licensing evidence.
              </label>
              <label>
                <input type="checkbox" name="insuranceChecked" required />I
                checked insurance covering this service.
              </label>
              <label>
                <input type="checkbox" name="safeguardsChecked" required />I
                reviewed{" "}
                {category?.kind === "dentistry"
                  ? "training, patient assessment, consent and clinical safeguards"
                  : "premises, hygiene/infection control and age safeguards"}
                .
              </label>
              {category?.kind === "dentistry" && (
                <label>
                  <input type="checkbox" name="dentistConfirmed" required />
                  The GDC register confirms this professional is a dentist.
                </label>
              )}
              <label>
                Review reason and evidence references
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                />
              </label>
              <p>
                Keep evidence references concise. Do not enter patient
                information or identity documents here. This records your
                review; it does not automatically verify an external register.
              </p>
              <button className="button" type="submit">
                Save verified provider approval
              </button>
              {approval?.status === "approved" && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (!form) return;
                    const reason = String(
                      new FormData(form).get("reason") ?? "",
                    ).trim();
                    if (reason.length < 5 || reason.length > 1000) {
                      setNotice(
                        "Enter a review reason of 5–1,000 characters before revoking approval.",
                      );
                      return;
                    }
                    void save(
                      {
                        status: "revoked",
                        categoryId,
                        professionalId,
                        reason,
                      },
                      true,
                    );
                  }}
                >
                  Revoke approval
                </button>
              )}
            </fieldset>
          </form>
        </>
      )}
    </section>
  );
}
