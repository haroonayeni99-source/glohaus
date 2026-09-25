import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";

export type LiveEligibility = {
  eligible: boolean;
  followers: number;
  followersRequired: number;
  completedBookings: number;
  completedBookingsRequired: number;
  verified: boolean;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  goodStanding: boolean;
  seriousModerationRestriction: boolean;
  liveRestrictedUntil: string | null;
};

export async function liveEligibility(
  db: SqlClient,
  professionalId: string,
): Promise<LiveEligibility> {
  const row = (
    await db.query<{ eligibility: LiveEligibility }>(
      "SELECT beauty.live_eligibility($1) AS eligibility",
      [professionalId],
    )
  ).rows[0];
  if (!row?.eligibility) throw new Error("LIVE eligibility is unavailable.");
  return row.eligibility;
}
