import type { PolicyPreview } from "@/modules/policies/domain";
import { money } from "@/modules/professionals/domain";
const instructions: Record<string, string> = {
  clean_hair: "Arrive with clean or washed hair.",
  remove_makeup: "Remove makeup before treatment.",
  bring_products:
    "Bring the products or extensions agreed with your professional.",
  consultation: "Arrange a consultation before treatment.",
  patch_test: "Arrange the required patch test before treatment.",
  reference_photos: "Provide reference photographs before the appointment.",
};
export function ProfessionalPolicySummary({
  policy,
  showPrice = true,
}: {
  policy: PolicyPreview;
  showPrice?: boolean;
}) {
  const r = policy.rules;
  const paymentRequirement = policy.paymentRequirement ?? r.paymentRequirement;
  return (
    <div className="professional-policies policy-summary">
      {showPrice && (
        <p className="policy-material">
          <strong>
            {policy.fullPrepayment ? "Service prepayment" : "Deposit"}:{" "}
            {money(policy.depositPence)}
          </strong>{" "}
          · Booking fee {money(policy.bookingFeePence)} · Pay now{" "}
          <strong>{money(policy.depositPence + policy.bookingFeePence)}</strong>
          . Service price {money(policy.pricePence)}.
        </p>
      )}
      <dl>
        <div>
          <dt>Booking payment</dt>
          <dd>{paymentRequirement === "full" ? "Full payment online is required before the appointment." : policy.fullPrepayment ? "The full service price is paid online at booking." : "Pay the deposit or choose to pay in full online. Any remaining balance is due at the appointment, including cash if agreed with the professional."}</dd>
        </div>
        <div>
          <dt>Cancellation notice</dt>
          <dd>
            {r.cancellationHours} hours. Timely cancellations and professional
            cancellations receive a full refund. Statutory cancellation and
            service-quality rights take priority. Later cancellations need an
            individual assessment; any retention must be fair, supported by
            actual losses and reviewed by GLOHAUS.
          </dd>
        </div>
        <div>
          <dt>Late arrival</dt>
          <dd>
            {r.graceMinutes} minute grace period.{" "}
            {r.lateInstructions ||
              "Contact your professional if delayed. Proceeding, an agreed shorter service or a permitted cancellation can be discussed."}{" "}
            Being marked late does not automatically forfeit your payment.
          </dd>
        </div>
        <div>
          <dt>Rescheduling</dt>
          <dd>
            {r.rescheduleHours} hours’ notice; up to {r.maxReschedules}{" "}
            customer-initiated changes.{" "}
            {r.freeReschedule
              ? "One free reschedule is allowed, subject to availability. Further permitted changes need approval and do not create an automatic charge."
              : "Changes require the professional’s approval and an available appointment. No automatic rescheduling charge applies."}
          </dd>
        </div>
        <div>
          <dt>Accompanying guests</dt>
          <dd>
            {r.guests === "allowed"
              ? "Guests allowed."
              : r.guests === "none"
                ? "No additional guests."
                : "Guests need prior approval."}{" "}
            {r.children === "allowed"
              ? "Children permitted."
              : r.children === "none"
                ? "Children cannot accompany appointments."
                : "Accompanying children need prior approval."}{" "}
            Reasonable accessibility arrangements and lawful exceptions remain
            available.
          </dd>
        </div>
      </dl>
      {(r.preparation.length > 0 || r.preparationText) && (
        <div>
          <strong>Appointment preparation</strong>
          <ul>
            {Array.from(new Set(r.preparation)).map((p) => (
              <li key={p}>{instructions[p]}</li>
            ))}
          </ul>
          {r.preparationText && (
            <p className="policy-text">{r.preparationText}</p>
          )}
        </div>
      )}
      {(r.requireReferences || r.requireConsultation || r.requirePatchTest) && (
        <p className="policy-material">
          <strong>Before treatment:</strong>{" "}
          {[
            r.requireReferences && "reference photographs",
            r.requireConsultation && "a consultation",
            r.requirePatchTest && "a patch test",
          ]
            .filter(Boolean)
            .join(", ")}
          . Complete the private preparation section after booking; your
          professional must verify readiness. These checks do not replace
          clinical screening or informed consent.
        </p>
      )}
      {r.restrictions && (
        <p className="policy-text">
          <strong>Service restrictions:</strong> {r.restrictions}
        </p>
      )}
      {policy.generalCustomRules && (
        <p className="policy-text">
          <strong>General additional rules:</strong> {policy.generalCustomRules}
        </p>
      )}
      {policy.serviceCustomRules && (
        <p className="policy-text">
          <strong>Service additional rules:</strong> {policy.serviceCustomRules}
        </p>
      )}
      <p>
        Custom instructions cannot remove your statutory rights, impose
        automatic penalties or override GLOHAUS refund protections. Payment
        for the online booking is handled securely through GLOHAUS.
      </p>
      <p>
        For an online booking, you can cancel an unperformed service without
        giving a reason during the 14-day cooling-off period, starting the day
        after booking. Use Cancel appointment in your booking or contact
        GLOHAUS. Requesting an earlier appointment does not automatically waive
        that right. Any lawful payment for work already provided needs a
        separate assessment; rights relating to service quality still apply.
      </p>
      {policy.publishedAt && (
        <small>
          Published {new Date(policy.publishedAt).toLocaleDateString("en-GB")} ·
          Appointment times: {policy.timezone}.
        </small>
      )}
    </div>
  );
}
