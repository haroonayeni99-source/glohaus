"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  defaultPolicy,
  inheritedPolicy,
  mergePolicyFields,
  policyFieldsSchema,
  preparationOptions,
  type PolicyFields,
  type PolicyPreview,
  type PolicyWorkspace,
} from "@/modules/policies/domain";
import { ProfessionalPolicySummary } from "./professional-policy-summary";
export function ProfessionalPolicyEditor({ data,initialServiceId="" }: { data: PolicyWorkspace;initialServiceId?:string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [policy, setPolicy] = useState<PolicyFields>(
    data.scopes.find((s) => s.service_id === (initialServiceId||null))?.draft || (initialServiceId?inheritedPolicy:defaultPolicy),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [savedPolicy, setSavedPolicy] = useState(() => JSON.stringify(policy));
  const dirty = JSON.stringify(policy) !== savedPolicy;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        link instanceof HTMLAnchorElement &&
        link.target !== "_blank" &&
        link.href !== window.location.href &&
        !window.confirm(
          "You have unsaved policy changes. Leave this page and discard them?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  const scope = data.scopes.find((s) => s.service_id === (serviceId || null));
  const versions = data.versions.filter((v) => v.scope_id === scope?.id);
  function field<K extends keyof PolicyFields>(key: K, value: PolicyFields[K]) {
    setPolicy((p) => ({ ...p, [key]: value }));
  }
  async function save(action: "save" | "publish" | "unpublish") {
    const parsed = policyFieldsSchema.safeParse(policy);
    if (!parsed.success) {
      setNotice(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/professional/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: serviceId || null,
          action,
          expectedRevision: scope?.revision || 0,
          policy: parsed.data,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error?.message || "Could not save policies.");
      setSavedPolicy(JSON.stringify(policy));
      setNotice(
        result.reviewRequired
          ? "Saved for Admin review. Your existing published policy remains in place until approval."
          : action === "publish"
            ? "Published for future bookings. Existing bookings retain their accepted version."
            : action === "unpublish"
              ? "Unpublished for future bookings. Existing booking terms are preserved."
              : "Draft saved.",
      );
      dialog.current?.close();
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const generalScope = data.scopes.find((s) => s.service_id === null);
  const publishedGeneral =
    data.versions.find((v) => v.id === generalScope?.published_version_id)
      ?.content || defaultPolicy;
  const resolved = serviceId
    ? mergePolicyFields(publishedGeneral, policy)
    : mergePolicyFields(policy);
  const sample: PolicyPreview = {
    token: "preview",
    generalVersionId: null,
    serviceVersionId: null,
    rules: resolved,
    generalCustomRules: serviceId
      ? publishedGeneral.customRules
      : policy.customRules,
    serviceCustomRules: serviceId ? policy.customRules : "",
    timezone: "Europe/London",
    pricePence: 5000,
    depositPence: resolved.paymentRequirement === "full" ? 5000 : Math.round((5000 * (resolved.depositPercent || 30)) / 100),
    bookingFeePence: 100,
    fullPrepayment: resolved.paymentRequirement === "full",
    paymentRequirement: resolved.paymentRequirement ?? "deposit_or_full",
    publishedAt: null,
  };
  return (
    <div className="professional-policies">
      <p>
        General policies apply to all appointments. Service timing, payment and
        guest choices override general choices; preparation and safety
        requirements are added together. Existing bookings retain their accepted
        terms.
      </p>
      <label>
        Policy scope
        <select
          value={serviceId}
          disabled={busy}
          onChange={(e) => {
            if (
              dirty &&
              !window.confirm(
                "Discard unsaved changes before switching policies?",
              )
            )
              return;
            const next = e.target.value;
            const nextPolicy =
              data.scopes.find((s) => s.service_id === (next || null))?.draft ||
              (next ? inheritedPolicy : defaultPolicy);
            setServiceId(next);
            setPolicy(nextPolicy);
            setSavedPolicy(JSON.stringify(nextPolicy));
            setNotice("");
            setPreview(false);
          }}
        >
          <option value="">General — all appointments</option>
          {data.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {dirty && <p role="status">You have unsaved changes.</p>}
      <p>
        Last updated:{" "}
        {scope
          ? new Date(scope.updated_at).toLocaleString("en-GB")
          : "Not saved yet"}
        .{" "}
        {scope?.published_version_id
          ? "A published version is active."
          : "GLOHAUS defaults apply until publication."}
      </p>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save("save");
        }}
      >
        <div className="policy-grid">
          {(
            [
              [
                "graceMinutes",
                "Late arrival grace (minutes)",
                [0, 5, 10, 15, 20, 30],
              ],
              [
                "cancellationHours",
                "Cancellation notice (hours)",
                [6, 12, 24, 48, 72],
              ],
              [
                "rescheduleHours",
                "Rescheduling notice (hours)",
                [6, 12, 24, 48, 72],
              ],
              [
                "maxReschedules",
                "Maximum customer reschedules",
                [0, 1, 2, 3, 4, 5],
              ],
            ] as const
          ).map(([key, label, options]) => (
            <label key={key}>
              {label}
              <select
                value={policy[key] ?? ""}
                onChange={(e) =>
                  field(
                    key,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                {serviceId && <option value="">Use general policy</option>}
                {options.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Required deposit percentage
            <select
              value={policy.depositPercent ?? ""}
              onChange={(e) =>
                field(
                  "depositPercent",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">
                Use existing service deposit
                {serviceId ? " / general policy" : ""}
              </option>
              {Array.from({ length: 26 }, (_, i) => i + 15).map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
            <small>
              Verified deposits remain 15%–40%. Unverified trial bookings retain
              full online prepayment and existing limits.
            </small>
          </label>
          <label>
            Booking payment
            <select value={policy.paymentRequirement ?? ""} onChange={e=>field("paymentRequirement",e.target.value === "" ? null : e.target.value as "deposit_or_full" | "full")}>
              {serviceId && <option value="">Use general policy</option>}
              <option value="deposit_or_full">Allow deposit or full payment</option>
              <option value="full">Require full payment online</option>
            </select>
            <small>Verified professionals can require full payment or let customers choose. With a deposit, the remaining balance is paid at the appointment, including cash if agreed. Unverified bookings still require full payment online.</small>
          </label>
          {(
            [
              ["guests", "Additional guests"],
              ["children", "Accompanying children"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={policy[key] ?? ""}
                onChange={(e) =>
                  field(
                    key,
                    (e.target.value || null) as PolicyFields[typeof key],
                  )
                }
              >
                {serviceId && <option value="">Use general policy</option>}
                <option value="allowed">Allowed</option>
                <option value="none">Not permitted</option>
                <option value="approval">Prior approval required</option>
              </select>
            </label>
          ))}
          <label>
            First reschedule
            <select
              value={
                policy.freeReschedule === null
                  ? ""
                  : String(policy.freeReschedule)
              }
              onChange={(e) =>
                field(
                  "freeReschedule",
                  e.target.value === "" ? null : e.target.value === "true",
                )
              }
            >
              {serviceId && <option value="">Use general policy</option>}
              <option value="true">
                One free change, subject to availability
              </option>
              <option value="false">Prior professional approval</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Appointment preparation templates</legend>
          {preparationOptions.map((option) => (
            <label className="policy-check" key={option}>
              <input
                type="checkbox"
                checked={policy.preparation.includes(option)}
                onChange={(e) =>
                  field(
                    "preparation",
                    e.target.checked
                      ? [...policy.preparation, option]
                      : policy.preparation.filter((p) => p !== option),
                  )
                }
              />
              {option.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Required checks before treatment</legend>
          {(
            [
              ["requireReferences", "Reference photographs"],
              ["requireConsultation", "Consultation"],
              ["requirePatchTest", "Patch test"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={policy[key] === null ? "" : String(policy[key])}
                onChange={(e) =>
                  field(
                    key,
                    e.target.value === "" ? null : e.target.value === "true",
                  )
                }
              >
                {serviceId && <option value="">Use general policy</option>}
                <option value="false">Not required by this policy</option>
                <option value="true">Required before treatment</option>
              </select>
            </label>
          ))}
        </fieldset>
        {(
          [
            ["lateInstructions", "What happens if a customer is late?", 1000],
            ["preparationText", "Additional preparation instructions", 1500],
            [
              "restrictions",
              "Service restrictions and safety requirements",
              1500,
            ],
            ["customRules", "Additional professional rules", 3000],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key}>
            {label}
            <textarea
              value={policy[key]}
              maxLength={max}
              rows={4}
              onChange={(e) => field(key, e.target.value)}
            />
            <small>
              {policy[key].length}/{max} characters
            </small>
          </label>
        ))}
        <p>
          Free-text instructions require Admin review before publication. They
          cannot create automatic charges, make every deposit non-refundable,
          exclude statutory rights or allow unlawful discrimination. Clinical
          screening and informed consent must be completed separately.
        </p>
        <div className="editor-actions">
          <button className="button" disabled={busy}>
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPreview((v) => !v)}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.showModal()}
          >
            Publish policies
          </button>
          <button
            type="button"
            disabled={busy || !scope?.published_version_id}
            onClick={() => void save("unpublish")}
          >
            Unpublish
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPolicy(serviceId ? inheritedPolicy : defaultPolicy);
              setNotice(
                "GLOHAUS template loaded into the draft. Save or publish when ready.",
              );
            }}
          >
            Load GLOHAUS template
          </button>
        </div>
      </form>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {preview && (
        <section className="policy-card">
          <h2>Draft preview</h2>
          <p>
            Illustrative £50 service. Service-specific inherited choices use the
            currently published general policy; final prices and fees are
            checked again at checkout.
          </p>
          <ProfessionalPolicySummary policy={sample} />
        </section>
      )}
      <section>
        <h2>Version history</h2>
        {versions.length ? (
          versions.map((v) => (
            <details key={v.id}>
              <summary>
                Version {v.version} · {v.review_status} ·{" "}
                {new Date(v.created_at).toLocaleString("en-GB")}
              </summary>
              {v.review_reason && <p>Review reason: {v.review_reason}</p>}
              <ProfessionalPolicySummary
                showPrice={false}
                policy={{
                  ...sample,
                  fullPrepayment: v.content.paymentRequirement === "full",
                  paymentRequirement: v.content.paymentRequirement ?? "deposit_or_full",
                  rules: {
                    ...defaultPolicy,
                    ...Object.fromEntries(
                      Object.entries(v.content).filter(([, x]) => x !== null),
                    ),
                  },
                  generalCustomRules: v.content.customRules,
                  serviceCustomRules: "",
                  publishedAt: v.published_at,
                }}
              />
            </details>
          ))
        ) : (
          <p>No published or submitted versions yet.</p>
        )}
      </section>
      <dialog
        ref={dialog}
        className="policy-dialog"
        aria-labelledby="policy-publish-title"
      >
        <h2 id="policy-publish-title">Publish these policies?</h2>
        <p>
          Future bookings will use this new version once published. Free-text
          rules require Admin review. Customers must acknowledge the applicable
          terms before payment.
        </p>
        <button
          className="button"
          disabled={busy}
          onClick={() => void save("publish")}
        >
          Confirm publication
        </button>
        <button disabled={busy} onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </dialog>
    </div>
  );
}
