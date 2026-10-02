import "server-only";

import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";

export type ProfessionalAccessState = {
  status: "unverified" | "pending" | "verified" | "restricted";
  verified: boolean;
  paymentReady: boolean;
  starterBookingsUsed: number;
  starterBookingsRemaining: number | null;
};

export async function professionalAccessState(
  db: SqlClient,
  professionalId: string,
): Promise<ProfessionalAccessState> {
  const row = (
    await db.query<{ access: ProfessionalAccessState }>(
      "SELECT beauty.professional_access_state($1) AS access",
      [professionalId],
    )
  ).rows[0];
  if (!row?.access) throw new AccessError("UNAVAILABLE", 503);
  return row.access;
}

export function assertStarterServiceAllowed(
  access: ProfessionalAccessState,
  input: { active: boolean; pricePence: number; depositPence: number },
) {
  if (!input.active) return;
  if (access.status === "restricted")
    throw new AccessError("PROFESSIONAL_RESTRICTED", 403);
  if (!access.verified && (input.pricePence > 20000 || input.depositPence > 0))
    throw new AccessError("VERIFICATION_REQUIRED", 409);
}

export function assertProductPublishingAllowed(
  access: ProfessionalAccessState,
  publicationStatus: string,
) {
  if (publicationStatus !== "published") return;
  if (access.status === "restricted")
    throw new AccessError("PROFESSIONAL_RESTRICTED", 403);
  if (!access.verified) throw new AccessError("VERIFICATION_REQUIRED", 409);
}

export function assertWithdrawalAllowed(access: ProfessionalAccessState) {
  if (access.status === "restricted")
    throw new AccessError("PROFESSIONAL_RESTRICTED", 403);
  if (!access.verified)
    throw new AccessError("VERIFICATION_REQUIRED", 409);
}

export function assertBookingAllowed(
  access: ProfessionalAccessState,
  service: { pricePence: number; depositPence: number },
) {
  if (access.status === "restricted")
    throw new AccessError("PROFESSIONAL_RESTRICTED", 403);
  if (access.verified) return;
  if ((access.starterBookingsRemaining ?? 0) <= 0)
    throw new AccessError("VERIFICATION_REQUIRED", 409);
  if (service.pricePence > 20000 || service.depositPence > 0)
    throw new AccessError("VERIFICATION_REQUIRED", 409);
}
