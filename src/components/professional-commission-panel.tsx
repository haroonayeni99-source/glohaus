"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfessionalCommissionOverview } from "@/modules/commission/domain";
import { money } from "@/modules/professionals/domain";
export function ProfessionalCommissionPanel({
  data,
}: {
  data: ProfessionalCommissionOverview;
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const response = await fetch("/api/v1/professional/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f)),
      });
      if (!response.ok)
        throw new Error(
          "Submit feedback from day 10 of your trial. Complete every answer.",
        );
      setNotice(
        "Feedback received. GLOHAUS will check your trial participation; critical feedback is equally welcome.",
      );
      router.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="commission-centre">
      <section className="commission-box">
        <h2>Your service commission</h2>
        <p>
          <strong>{(data.effective.basisPoints / 100).toFixed(2)}%</strong> for
          new bookings. Each existing booking keeps its agreed rate.
        </p>
        <p>
          Rule: {data.effective.ruleReference}.{" "}
          {data.effective.expiresAt &&
            `Expires ${new Date(data.effective.expiresAt).toLocaleString("en-GB")}.`}
        </p>
        <p>
          Payment processing, customer booking fees and withdrawals are
          separate. Commission is not shown to customers.
        </p>
      </section>
      <section className="commission-box">
        <h2>Commission notices</h2>
        {data.notices.length ? (
          data.notices.map((n, i) => (
            <article className="commission-rule" key={i}>
              <p>{n.body}</p>
              <small>
                Notified {new Date(n.created_at).toLocaleString("en-GB")}
              </small>
            </article>
          ))
        ) : (
          <p>No upcoming commission notices.</p>
        )}
      </section>
      {data.founding && (
        <section className="commission-box">
          <h2>Your founding programme</h2>
          <p>
            14 days at 0% GLOHAUS service commission, plus another 30 days for
            qualifying participants who complete their feedback. Publish your
            work or receive a paid booking during your trial. Both positive and
            critical feedback are welcome.
          </p>
          <p>
            {data.founding.reward_rule_id
              ? "Your 30-day reward is granted."
              : data.founding.submitted_at
                ? "Feedback received — awaiting participation review."
                : "Complete the questionnaire from day 10 of your trial."}
          </p>
          {!data.founding.submitted_at && (
            <form className="editor-form" onSubmit={(e) => void submit(e)}>
              <label>
                How was your experience?
                <textarea
                  name="experience"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <label>
                What should we improve?
                <textarea
                  name="improve"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <label>
                Would you use GLOHAUS again, and why?
                <textarea name="useAgain" required maxLength={500} />
              </label>
              <button className="button" disabled={busy}>
                {busy ? "Saving…" : "Submit feedback"}
              </button>
              <p role="status">{notice}</p>
            </form>
          )}
        </section>
      )}
      <section className="commission-box">
        <h2>Your agreed booking commission</h2>
        <div className="commission-table">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Pricing version</th>
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((b) => (
                <tr key={b.booking_id}>
                  <td>{b.booking_id}</td>
                  <td>{(b.basis_points / 100).toFixed(2)}%</td>
                  <td>{money(b.commission_pence)}</td>
                  <td>{b.pricing_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
