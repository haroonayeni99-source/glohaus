"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CommissionAction,
  CommissionOverview,
  CommissionSimulation,
} from "@/modules/commission/domain";
import { money } from "@/modules/professionals/domain";

const date = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  });
const iso = (value: FormDataEntryValue | null) =>
  new Date(String(value)).toISOString();
const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const errors: Record<string, string> = {
  CONTROL_DISABLED:
    "Activate the Centre after financial testing and Owner approval.",
  INVALID_COMMISSION_RULE:
    "Choose valid dates at least 24 hours ahead, an end date after the start, and a rate between 0% and 50%.",
  PROMOTIONS_STOPPED:
    "New promotions are paused. Earned founding rewards remain protected.",
  QUESTIONNAIRE_REQUIRED:
    "The professional must submit their questionnaire first.",
  PARTICIPATION_REQUIRED:
    "No qualifying paid booking or published post was found during this trial.",
  CONTRACTUAL_REWARD_PROTECTED:
    "An earned founding trial or reward cannot be cancelled.",
  FORBIDDEN: "Only the verified Owner may change commission.",
  CONFIRMATION_REQUIRED: "Review and confirm this financial change.",
};
async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      errors[data.error?.code] ||
        "The change was not saved. Check your inputs and try again.",
    );
  return data;
}
export function CommissionControlCentre({
  data,
}: {
  data: CommissionOverview;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<CommissionAction | null>(null);
  const [simulation, setSimulation] = useState<CommissionSimulation | null>(
    null,
  );
  useEffect(() => {
    if (draft) dialog.current?.showModal();
    else dialog.current?.close();
  }, [draft]);
  function review(action: CommissionAction) {
    setDraft(action);
    setNotice("");
  }
  async function confirm() {
    if (!draft) return;
    setBusy(true);
    try {
      await post("/api/v1/admin/commission", draft);
      setNotice(
        "Saved. Existing bookings retain their original pricing terms.",
      );
      setDraft(null);
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const f = new FormData(event.currentTarget);
      const pro = String(f.get("professionalId") || "");
      review({
        action: "create",
        kind: pro ? "individual" : "platform",
        professionalId: pro || null,
        scope: String(f.get("scope")) as "all",
        basisPoints: Math.round(Number(f.get("percentage")) * 100),
        startsAt: iso(f.get("startsAt")),
        endsAt: iso(f.get("endsAt")),
        reason: String(f.get("reason")),
        confirmed: true,
      });
    } catch {
      setNotice("Choose valid dates.");
    }
  }
  async function simulate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const f = new FormData(event.currentTarget);
      const result = await post("/api/v1/admin/commission/simulate", {
        professionalId: String(f.get("professionalId")),
        scenario: String(f.get("scenario")),
        atTime: iso(f.get("atTime")),
        servicePence: Math.round(Number(f.get("price")) * 100),
        depositPence: Math.round(Number(f.get("deposit")) * 100),
        bookings: Number(f.get("bookings")),
        providerBasisPoints: Math.round(
          Number(f.get("providerPercentage")) * 100,
        ),
        providerFixedPence: Math.round(Number(f.get("providerFixed")) * 100),
        refundPence: Math.round(Number(f.get("refund")) * 100),
      });
      setSimulation(result);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Simulation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const proOptions = (
    <>
      {data.professionals.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  return (
    <div className="commission-centre">
      <p className="form-notice" role="status">
        {notice}
      </p>
      <div className="commission-metrics">
        {[
          ["Commission collected", data.metrics.commissionEarnedPence],
          ["Commission waived", data.metrics.waivedPence],
          ["Recorded Stripe costs", data.metrics.paymentCostsPence],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{money(Number(value))}</strong>
          </article>
        ))}
      </div>
      <p>
        {data.metrics.costsPending} paid payments await Stripe cost
        reconciliation. {data.metrics.legacyWithoutTerms} legacy payments have
        no recoverable pricing snapshot. Totals cover service bookings; customer
        fees and Shop commission are separate.
      </p>
      <section className="commission-box">
        <h3>
          Control status:{" "}
          {data.settings.enabled
            ? "Active"
            : "Disabled — awaiting Owner activation"}
        </h3>
        <p>
          New promotions:{" "}
          {data.settings.new_promotions_enabled ? "Allowed" : "Paused"}.
          Emergency pause leaves scheduled agreements and earned founding
          rewards intact.
        </p>
        <form
          className="editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            review({
              action: data.settings.enabled ? "emergency" : "activation",
              enabled: data.settings.enabled
                ? !data.settings.new_promotions_enabled
                : true,
              reason: String(f.get("reason")),
              confirmed: true,
            });
          }}
        >
          <label>
            Reason for this control change
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <button className="button" disabled={busy}>
            {data.settings.enabled
              ? data.settings.new_promotions_enabled
                ? "Review emergency pause"
                : "Review resume promotions"
              : "Review Owner activation"}
          </button>
        </form>
      </section>
      <section className="commission-box">
        <h3>Schedule a commission rule</h3>
        <p>
          Choose platform-wide eligibility or one professional. Changes require
          at least 24 hours’ notice. Create a new rule to revise a rate; earlier
          snapshots stay unchanged.
        </p>
        <form className="editor-form commission-grid" onSubmit={create}>
          <label>
            Professional scope
            <select name="professionalId">
              <option value="">Platform-wide</option>
              {proOptions}
            </select>
          </label>
          <label>
            Eligibility
            <select name="scope">
              <option value="all">All professionals</option>
              <option value="verified">Verified professionals</option>
              <option value="unverified">Unverified professionals</option>
              <option value="starter">Verified Starter</option>
              <option value="pro">Verified Pro</option>
              <option value="premium">Verified Premium</option>
            </select>
          </label>
          <label>
            Commission percentage
            <input
              name="percentage"
              type="number"
              min={0}
              max={50}
              step="0.01"
              required
              defaultValue={0}
            />
          </label>
          <label>
            Starts (your local time)
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Ends (your local time)
            <input name="endsAt" type="datetime-local" required />
          </label>
          <label>
            Reason
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <button
            className="button"
            disabled={
              busy ||
              !data.settings.enabled ||
              !data.settings.new_promotions_enabled
            }
          >
            Review rule
          </button>
        </form>
      </section>
      <section className="commission-box">
        <h3>Founding Professionals Programme</h3>
        <p>
          14 days at 0% service commission. Qualifying participants who submit
          feedback earn another 30 days at 0%. Positive and critical feedback
          qualify equally. Payment processing, customer booking fees,
          verification and trial booking limits stay separate.
        </p>
        <form
          className="editor-form commission-grid"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const f = new FormData(e.currentTarget);
              review({
                action: "enrol",
                professionalId: String(f.get("professionalId")),
                startsAt: iso(f.get("startsAt")),
                reason: String(f.get("reason")),
                confirmed: true,
              });
            } catch {
              setNotice("Choose a valid trial start.");
            }
          }}
        >
          <label>
            Founding professional
            <select name="professionalId" required>
              {proOptions}
            </select>
          </label>
          <label>
            Trial starts (your local time)
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Reason
            <input name="reason" required minLength={5} maxLength={500} />
          </label>
          <button
            className="button"
            disabled={
              busy ||
              !data.settings.enabled ||
              !data.settings.new_promotions_enabled
            }
          >
            Review 14-day trial
          </button>
        </form>
        {data.founding.map((f) => (
          <article className="commission-rule" key={f.professional_id}>
            <h4>
              {data.professionals.find((p) => p.id === f.professional_id)?.name}
            </h4>
            <p>
              {f.reward_rule_id
                ? "30-day reward granted"
                : f.submitted_at
                  ? "Feedback submitted — awaiting participation review"
                  : "Awaiting end-of-trial feedback"}
            </p>
            {f.questionnaire && (
              <dl>
                <dt>Experience</dt>
                <dd>{f.questionnaire.experience}</dd>
                <dt>Improvements</dt>
                <dd>{f.questionnaire.improve}</dd>
                <dt>Use again?</dt>
                <dd>{f.questionnaire.useAgain}</dd>
              </dl>
            )}
            {f.submitted_at && !f.reward_rule_id && (
              <form
                className="editor-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  review({
                    action: "qualify",
                    professionalId: f.professional_id,
                    reason: String(fd.get("reason")),
                    confirmed: true,
                  });
                }}
              >
                <label>
                  Participation review reason
                  <input name="reason" required minLength={5} maxLength={500} />
                </label>
                <button className="button" disabled={busy}>
                  Review 30-day reward
                </button>
              </form>
            )}
          </article>
        ))}
      </section>
      <section className="commission-box">
        <h3>Active, upcoming and past rules</h3>
        <p>
          Priority: founding rewards → individual agreement → platform promotion
          → standard plan rate. Newest start wins within the same scope.
          Existing individual agreements outrank global promotions.
        </p>
        {data.rules.length === 0 && (
          <p>No commission promotions have been created.</p>
        )}
        {data.rules.map((rule) => {
          const ending =
            rule.cancelled_from && rule.cancelled_from < rule.ends_at
              ? rule.cancelled_from
              : rule.ends_at;
          const state =
            Date.parse(ending) <= Date.parse(data.asOf)
              ? "Expired"
              : Date.parse(rule.starts_at) > Date.parse(data.asOf)
                ? "Upcoming"
                : "Active";
          return (
            <article className="commission-rule" key={rule.id}>
              <h4>
                {percent(rule.basis_points)} · {rule.kind.replaceAll("_", " ")}{" "}
                · {state}
              </h4>
              <p>
                {rule.professional_id
                  ? data.professionals.find(
                      (p) => p.id === rule.professional_id,
                    )?.name
                  : "Platform-wide"}{" "}
                · {rule.scope}
              </p>
              <p>
                {date(rule.starts_at)} → {date(ending)} (London)
              </p>
              <p>{rule.reason}</p>
              <small>Rule {rule.id}</small>
              {!rule.kind.startsWith("founding") &&
                state !== "Expired" &&
                !rule.cancelled_from && (
                  <form
                    className="editor-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        const f = new FormData(e.currentTarget);
                        review({
                          action: "cancel",
                          ruleId: rule.id,
                          cancelledFrom: iso(f.get("cancelledFrom")),
                          reason: String(f.get("reason")),
                          confirmed: true,
                        });
                      } catch {
                        setNotice("Choose a valid end date.");
                      }
                    }}
                  >
                    <label>
                      End early from (at least 24 hours ahead)
                      <input
                        name="cancelledFrom"
                        type="datetime-local"
                        required
                      />
                    </label>
                    <label>
                      Reason
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button className="button button-light" disabled={busy}>
                      Review early end
                    </button>
                  </form>
                )}
            </article>
          );
        })}
      </section>
      <section className="commission-box">
        <h3>Test Mode — read-only</h3>
        <p>
          Uses the server rule resolver, including scheduled rules, without
          creating a booking, charge, transfer or wallet entry. Stripe costs are
          estimates using the inputs below, not your contracted Stripe tariff.
        </p>
        <form
          className="editor-form commission-grid"
          onSubmit={(e) => void simulate(e)}
        >
          <label>
            Professional
            <select name="professionalId" required>
              {proOptions}
            </select>
          </label>
          <label>
            Commission scenario
            <select name="scenario">
              <option value="applied">Resolved rule at selected date</option>
              <option value="zero">Hypothetical 0%</option>
              <option value="two">Hypothetical 2%</option>
              <option value="standard">Standard plan rate</option>
            </select>
          </label>
          <label>
            Simulated booking pricing date
            <input name="atTime" type="datetime-local" required />
          </label>
          {[
            ["price", "Service price £", 50],
            ["deposit", "Deposit / prepayment £", 20],
            ["bookings", "Number of bookings", 1],
            ["providerPercentage", "Estimated Stripe percentage", 1.5],
            ["providerFixed", "Estimated Stripe fixed fee £", 0.2],
            ["refund", "Refund per booking £", 0],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <input
                name={String(name)}
                type="number"
                min={name === "bookings" ? 1 : 0}
                step={name === "bookings" ? 1 : 0.01}
                defaultValue={value}
                required
              />
            </label>
          ))}
          <button
            className="button"
            disabled={busy || !data.professionals.length}
          >
            Run simulation
          </button>
        </form>
        {simulation && (
          <div className="commission-rule" role="status">
            <h4>Applied rate {percent(simulation.rule.basisPoints)}</h4>
            <p>
              Rule {simulation.rule.ruleReference} ·{" "}
              {simulation.rule.pricingVersion}
            </p>
            <dl>
              {[
                ["Commission per booking", simulation.commissionPence],
                ["Customer pays now", simulation.chargePence],
                [
                  "Professional pending proceeds",
                  simulation.professionalPendingPence,
                ],
                ["Estimated Stripe cost", simulation.providerCostPence],
                ["Platform net before refunds", simulation.platformNetPence],
                ["Waived commission", simulation.waivedPence],
                [
                  "Professional balance after refund",
                  simulation.professionalAfterRefundPence,
                ],
                [
                  "Refund shortfall recorded as obligation",
                  simulation.refundObligationPence,
                ],
                ["Total commission", simulation.totalCommissionPence],
                [
                  "Total estimated Stripe costs",
                  simulation.totalProviderCostPence,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{money(Number(value))}</dd>
                </div>
              ))}
            </dl>
            {simulation.problems.map((p) => (
              <p className="admin-action-warning" key={p}>
                {p}
              </p>
            ))}
            <p>
              Commission stays non-refundable. Refund model assumes only this
              booking’s proceeds are available; actual refunds use the existing
              protected wallet and dispute rules.
            </p>
          </div>
        )}
      </section>
      <section className="commission-box">
        <h3>Promotion performance</h3>
        <div className="commission-table">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Paid bookings</th>
                <th>Commission collected</th>
                <th>Waived</th>
                <th>Stripe costs recorded</th>
              </tr>
            </thead>
            <tbody>
              {data.performance.map((p) => (
                <tr key={p.rule_reference}>
                  <td>{p.rule_reference}</td>
                  <td>{p.paid_bookings}</td>
                  <td>{money(p.earned_pence)}</td>
                  <td>{money(p.waived_pence)}</td>
                  <td>{money(p.provider_cost_pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="commission-box">
        <h3>Commission audit</h3>
        {data.audit.map((a, i) => (
          <details key={i}>
            <summary>
              {date(a.created_at)} · {a.action}
            </summary>
            <p>
              Owner {a.actor_user_id} · {a.reason}
            </p>
            <h4>Previous value</h4>
            <pre>{JSON.stringify(a.previous_state, null, 2)}</pre>
            <h4>New value</h4>
            <pre>{JSON.stringify(a.new_state, null, 2)}</pre>
          </details>
        ))}
      </section>
      <dialog
        ref={dialog}
        className="commission-confirm"
        aria-labelledby="commission-confirm-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setDraft(null);
        }}
      >
        {draft && (
          <>
            <h3 id="commission-confirm-title">Confirm commission change</h3>
            <p>
              This affects new booking pricing. Review the exact values before
              confirming.
            </p>
            <dl>
              {Object.entries(draft)
                .filter(([key]) => key !== "confirmed")
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {typeof value === "boolean"
                        ? value
                          ? "Yes"
                          : "No"
                        : String(value ?? "Platform-wide")}
                    </dd>
                  </div>
                ))}
            </dl>
            <button
              className="button"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : "Confirm financial change"}
            </button>
            <button
              className="button button-light"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
