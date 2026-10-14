"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/modules/professionals/domain";
import type { BookingPolicy } from "@/modules/policies/domain";
import { ProfessionalPolicySummary } from "./professional-policy-summary";
export function BookingPoliciesPanel({
  id,
  data,
  professional,
  status,
  professionalName,
}: {
  id: string;
  data: BookingPolicy;
  professional: boolean;
  status: string;
  professionalName: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [healthConsent, setHealthConsent] = useState(
    Boolean(data.requirements?.health_consent_at),
  );
  const [declineReason, setDeclineReason] = useState("");
  async function action(body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/bookings/${id}/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error?.message || "Could not save this update.");
      setNotice("Saved. No new charge was created.");
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const terms = data.terms;
  const rules = terms?.snapshot.rules;
  const canPrepare = ["confirmed", "payment_pending"].includes(status);
  const pendingReschedule = data.events.filter(
    (e) =>
      e.kind === "reschedule_requested" &&
      !data.events.some((answer) => answer.details.requestId === e.id),
  );
  const offers = data.events.filter(
    (e) =>
      e.kind === "late" &&
      e.details.decision === "offer_shorten" &&
      !data.events.some((answer) => answer.details.offerId === e.id),
  );
  return (
    <section className="professional-policies policy-card">
      <h2>Your agreed rules & booking policies</h2>
      {terms ? (
        <>
          <p>
            {terms.acknowledged_at
              ? `Acknowledged ${new Date(terms.acknowledged_at).toLocaleString("en-GB")}.`
              : "Legacy booking: an acknowledgement timestamp was not recorded; existing GLOHAUS terms are preserved."}{" "}
            General version:{" "}
            {terms.snapshot.generalVersionId || "GLOHAUS default"}. Service
            version: {terms.snapshot.serviceVersionId || "General/default"}.
          </p>
          <ProfessionalPolicySummary policy={terms.snapshot} />
          <p>
            Original appointment:{" "}
            {new Date(terms.original_starts_at).toLocaleString("en-GB", {
              timeZone: terms.snapshot.timezone,
            })}
            . Future policy changes do not change this booking.
          </p>
        </>
      ) : (
        <p>
          Historical professional policy details are unavailable. Your original
          booking and platform refund protections still apply.
        </p>
      )}
      <details>
        <summary>Cancellation and refund assessment</summary>
        <p>
          Accepted notice: {data.assessment.noticeHours} hours.{" "}
          {data.assessment.mandatoryFullRefund
            ? "A full refund is required under this assessment."
            : "Individual circumstances and statutory rights must be assessed. Any retention requires evidence and Admin review."}
        </p>
        <p>
          Minimum eligible refund:{" "}
          <strong>{money(data.assessment.minimumRefundPence)}</strong> of{" "}
          {money(data.assessment.remainingPaidPence)} still paid. This is an
          eligibility assessment; it does not mean a refund has been sent.
        </p>
        <Link href="/contact">Contact GLOHAUS about a disputed refund</Link>
      </details>
      {!professional &&
        status === "confirmed" &&
        Number(rules?.maxReschedules) > 0 && (
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action({
                action: "reschedule",
                startsAt: selected,
                reason: String(f.get("reason")),
              });
            }}
          >
            <h3>Reschedule your appointment</h3>
            <p>
              Use your accepted notice period. One free change applies only if
              permitted; other allowed changes need approval. Your price,
              deposit and accepted policy remain unchanged.
            </p>
            <label>
              New appointment date
              <input
                type="date"
                required
                onChange={async (e) => {
                  setSlots([]);
                  setSelected("");
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/bookings/${id}/policy/availability?date=${encodeURIComponent(e.target.value)}`,
                    );
                    const r = await response.json();
                    if (!response.ok)
                      throw Error(
                        r.error?.message || "Could not load available times.",
                      );
                    setSlots(r.slots);
                    setNotice(
                      r.slots.length
                        ? ""
                        : "No available appointments on this date.",
                    );
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "Could not load times.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <label>
              Available time
              <select
                value={selected}
                required
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a time</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {new Date(s).toLocaleTimeString("en-GB", {
                      timeZone: "Europe/London",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button disabled={busy || !selected}>Request reschedule</button>
          </form>
        )}
      {pendingReschedule.map((event) => (
        <div key={event.id} className="policy-event">
          <p>
            Requested appointment:{" "}
            {new Date(String(event.details.startsAt)).toLocaleString("en-GB", {
              timeZone: "Europe/London",
            })}{" "}
            — awaiting approval. Availability will be checked again.
          </p>
          {professional && status === "confirmed" && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void action({
                    action: "approve_reschedule",
                    eventId: event.id,
                    accepted: true,
                  })
                }
              >
                Approve available time
              </button>
              <label>
                Reason if declining this request
                <textarea
                  value={declineReason}
                  minLength={5}
                  maxLength={500}
                  onChange={(e) => setDeclineReason(e.target.value)}
                />
                <small>
                  Explain the decision without sensitive personal information.
                </small>
              </label>
              <button
                disabled={busy || declineReason.trim().length < 5}
                onClick={() =>
                  void action({
                    action: "approve_reschedule",
                    eventId: event.id,
                    accepted: false,
                    reason: declineReason,
                  })
                }
              >
                Decline request with explanation
              </button>
            </>
          )}
        </div>
      ))}
      {professional && status === "confirmed" && (
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action({
              action: "late",
              decision: String(f.get("decision")),
              shortenMinutes: Number(f.get("shortenMinutes")),
              reason: String(f.get("reason")),
            });
          }}
        >
          <h3>Record late arrival</h3>
          <p>
            This records your account of the arrival after the agreed grace
            period. It does not automatically retain payment. A shorter service
            requires customer agreement. Cancelling as the professional makes a
            full refund due.
          </p>
          <label>
            Decision
            <select name="decision">
              <option value="proceed">Proceed with appointment</option>
              <option value="offer_shorten">
                Offer shorter service by agreement
              </option>
              <option value="cancel">
                Cancel appointment and assess full refund
              </option>
            </select>
          </label>
          <label>
            Minutes to shorten if offering a shorter service
            <input
              name="shortenMinutes"
              type="number"
              min={5}
              max={240}
              defaultValue={15}
            />
          </label>
          <label>
            Reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
          <button disabled={busy}>Record arrival decision</button>
        </form>
      )}
      {!professional &&
        status === "confirmed" &&
        offers.map((event) => (
          <div key={event.id} className="policy-card">
            <h3>Shorter service offered</h3>
            <p>
              Your professional proposes shortening treatment by{" "}
              {String(event.details.shortenMinutes)} minutes. The agreed price
              stays unchanged. You can decline and discuss alternatives; this
              does not automatically forfeit any payment.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void action({
                  action: "accept_shorten",
                  eventId: event.id,
                  accepted: true,
                })
              }
            >
              Agree to this shorter service
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action({
                  action: "accept_shorten",
                  eventId: event.id,
                  accepted: false,
                })
              }
            >
              Decline shorter service
            </button>
          </div>
        ))}
      <h3>Private appointment preparation</h3>
      <p>
        Information and reference photos here are visible only to you and the
        booked professional. Optional health information is for preparing this
        appointment, does not replace clinical screening or informed consent,
        and is not shown on public profiles or in Admin policy review.
        Preparation text and photos are removed 30 days after the appointment.
      </p>
      {canPrepare && !professional && (
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action({
              action: "requirements",
              preparationInfo: String(f.get("preparationInfo") || ""),
              healthInfo: String(f.get("healthInfo") || ""),
              healthConsent,
              consultationDone: f.get("consultationDone") === "on",
              patchTestDone: f.get("patchTestDone") === "on",
            });
          }}
        >
          <label>
            Relevant preparation information
            <textarea
              name="preparationInfo"
              maxLength={1500}
              defaultValue={data.requirements?.preparation_info || ""}
            />
            <small>
              Use this for products, extensions and preparation. Do not include
              identity documents or medical records.
            </small>
          </label>
          <label className="policy-check">
            <input
              type="checkbox"
              checked={healthConsent}
              onChange={(e) => setHealthConsent(e.target.checked)}
            />
            I explicitly consent to sharing optional, relevant health
            information with {professionalName} for safely preparing this booked
            service. I can withdraw this consent here.
          </label>
          {healthConsent && (
            <label>
              Optional relevant health information
              <textarea
                name="healthInfo"
                maxLength={1000}
                defaultValue={data.requirements?.health_info || ""}
              />
              <small>
                Share only what is necessary. You may arrange a separate private
                consultation instead. This is not medical advice or clinical
                consent.
              </small>
            </label>
          )}
          <label className="policy-check">
            <input
              name="consultationDone"
              type="checkbox"
              defaultChecked={data.requirements?.consultation_done}
            />
            I have completed the required consultation, if applicable.
          </label>
          <label className="policy-check">
            <input
              name="patchTestDone"
              type="checkbox"
              defaultChecked={data.requirements?.patch_test_done}
            />
            I have completed the required patch test, if applicable.
          </label>
          <button disabled={busy}>Save preparation information</button>
          {data.requirements?.health_consent_at && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setHealthConsent(false);
                void action({ action: "withdraw_health" });
              }}
            >
              Withdraw consent and remove health information
            </button>
          )}
        </form>
      )}
      {professional && data.requirements && (
        <div className="policy-card">
          <p>
            Preparation: {data.requirements.preparation_info || "None shared"}
          </p>
          {data.requirements.health_info && (
            <p className="policy-text">
              Optional health information shared with explicit consent:{" "}
              {data.requirements.health_info}
            </p>
          )}
          <p>
            Customer reports consultation:{" "}
            {data.requirements.consultation_done
              ? "completed"
              : "not completed"}
            ; patch test:{" "}
            {data.requirements.patch_test_done ? "completed" : "not completed"}.
          </p>
        </div>
      )}
      {!canPrepare && !professional && data.requirements?.health_consent_at && (
        <button
          disabled={busy}
          onClick={() => void action({ action: "withdraw_health" })}
        >
          Withdraw consent and remove health information
        </button>
      )}
      <div className="policy-photos">
        {data.photos.map((photo) => (
          <figure key={photo.id}>
            <Image
              src={`/api/v1/bookings/${id}/policy/photos?photoId=${photo.id}`}
              width={160}
              height={160}
              unoptimized
              alt="Private reference photograph for this appointment"
            />
            {!professional && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/bookings/${id}/policy/photos?photoId=${photo.id}`,
                      { method: "DELETE" },
                    );
                    if (!response.ok)
                      throw Error("Could not remove photograph.");
                    router.refresh();
                  } catch (e) {
                    setNotice(
                      e instanceof Error ? e.message : "Could not remove.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove photograph
              </button>
            )}
          </figure>
        ))}
      </div>
      {canPrepare && !professional && (
        <label>
          Share a reference photograph (up to three)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || data.photos.length >= 3}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 3000000) {
                setNotice("Choose an image under 3 MB.");
                return;
              }
              setBusy(true);
              try {
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () => reject(Error("Could not read image."));
                  reader.readAsDataURL(file);
                });
                const response = await fetch(
                  `/api/v1/bookings/${id}/policy/photos`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      base64,
                      altText: "Reference photograph for booked service",
                    }),
                  },
                );
                const r = await response.json();
                if (!response.ok)
                  throw Error(
                    r.error?.message || "Could not upload photograph.",
                  );
                setNotice("Private reference photograph saved.");
                router.refresh();
              } catch (error) {
                setNotice(
                  error instanceof Error ? error.message : "Could not upload.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <small>
            Use style or product references. Do not upload medical records,
            identification or another person’s private photo without permission.
          </small>
        </label>
      )}
      {professional && status === "confirmed" && (
        <>
          <p>
            Readiness:{" "}
            {data.requirements?.professional_ready_at
              ? "Verified by the professional"
              : "Awaiting professional verification"}
            .
          </p>
          <button
            disabled={busy}
            onClick={() => void action({ action: "ready", confirmed: true })}
          >
            Confirm preparation checks completed
          </button>
          <p>
            Verify the actual consultation, photographs and patch test as
            appropriate. Complete legally required screening and informed
            consent separately.
          </p>
        </>
      )}
      {professional &&
        status === "cancelled" &&
        !data.assessment.mandatoryFullRefund &&
        !data.retention && (
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action({
                action: "retention",
                lossPence: Math.round(Number(f.get("loss")) * 100),
                evidence: String(f.get("evidence")),
                mitigation: String(f.get("mitigation")),
              });
            }}
          >
            <h3>Request evidence-based deposit retention review</h3>
            <p>
              A policy breach alone is insufficient. Explain actual direct
              losses and steps taken to reduce them. This requests review and
              does not keep or move money.
            </p>
            <label>
              Actual loss £
              <input
                type="number"
                name="loss"
                min="0.01"
                step="0.01"
                max={(terms?.deposit_pence || 0) / 100}
                required
              />
            </label>
            <label>
              Evidence of actual loss
              <textarea
                name="evidence"
                minLength={20}
                maxLength={2000}
                required
              />
            </label>
            <label>
              Steps taken to reduce the loss
              <textarea
                name="mitigation"
                minLength={20}
                maxLength={1000}
                required
              />
            </label>
            <button disabled={busy}>Submit for Admin review</button>
          </form>
        )}
      {data.retention && (
        <p className="policy-material">
          Deposit retention review: {data.retention.status}. Requested loss{" "}
          {money(data.retention.loss_pence)}. {data.retention.review_reason}{" "}
          <Link href="/contact">Dispute this assessment with GLOHAUS</Link>.
        </p>
      )}
      <details>
        <summary>Appointment change history ({data.events.length})</summary>
        {data.events.map((e) => (
          <div className="policy-event" key={e.id}>
            <strong>{e.kind.replaceAll("_", " ")}</strong> ·{" "}
            {new Date(e.created_at).toLocaleString("en-GB", {
              timeZone: "Europe/London",
            })}
            {Boolean(e.details.oldStartsAt) && (
              <p>
                From{" "}
                {new Date(String(e.details.oldStartsAt)).toLocaleString(
                  "en-GB",
                )}{" "}
                to{" "}
                {new Date(String(e.details.newStartsAt)).toLocaleString(
                  "en-GB",
                )}
                .
              </p>
            )}
            {Boolean(e.details.reason) && <p>{String(e.details.reason)}</p>}
          </div>
        ))}
      </details>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
