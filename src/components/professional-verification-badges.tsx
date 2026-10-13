import {
  ShieldCheck,
  Building2,
  BadgeCheck,
  ShieldQuestion,
  CircleAlert,
} from "lucide-react";
import type { PublicProfessional } from "@/modules/professionals/domain";

export function ProfessionalVerificationBadges({
  professional: pro,
}: {
  professional: Pick<
    PublicProfessional,
    | "verification_status"
    | "identity_verified"
    | "business_verified"
    | "professional_verified"
  >;
}) {
  if (pro.verification_status !== "verified") {
    return (
      <span className="professional-card-verification">
        {pro.verification_status === "restricted" ? (
          <CircleAlert size={15} aria-hidden />
        ) : (
          <ShieldQuestion size={15} aria-hidden />
        )}
        {pro.verification_status === "restricted"
          ? "Account restricted"
          : pro.verification_status === "pending"
            ? "Verification pending"
            : "Not yet verified"}
      </span>
    );
  }
  return (
    <div
      className="professional-verification-badges"
      aria-label="Professional verification checks"
    >
      <span
        className="verification-crest verification-crest-identity"
        title="Completed GLOHAUS identity and payment checks"
      >
        <ShieldCheck size={16} aria-hidden />
        Identity verified
      </span>
      {pro.business_verified === true && (
        <span
          className="verification-crest verification-crest-business"
          title="Business check approved by GLOHAUS"
        >
          <Building2 size={16} aria-hidden />
          Business verified
        </span>
      )}
      {pro.professional_verified === true && (
        <span
          className="verification-crest verification-crest-professional"
          title="Professional check approved by GLOHAUS"
        >
          <BadgeCheck size={16} aria-hidden />
          Professional verified
        </span>
      )}
    </div>
  );
}
