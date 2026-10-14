import { z } from "zod";

export const activityDecisionSchema = z
  .object({
    professionalId: z.uuid(),
    action: z.enum(["offer_boost", "hide", "restore"]),
    reason: z.string().trim().min(5).max(500),
    confirmed: z.literal(true),
  })
  .strict();

export type ProfessionalActivity = {
  id: string;
  business_name: string;
  slug: string | null;
  publication_status: string;
  last_activity_at: string;
  activity_source: "monitoring_started" | "website_visit" | "booking";
  inactive_days: number;
  stage: number;
  warning_at: string | null;
  can_hide: boolean;
  hidden_at: string | null;
  offer_until: string | null;
  boost_until: string | null;
  can_offer: boolean;
  upcoming_bookings: number;
};
export type ActivityOverview = {
  asOf: string;
  total: number;
  page: number;
  rows: ProfessionalActivity[];
  email: {
    pending: number;
    accepted: number;
    cancelled: number;
    exhausted: number;
  };
};
export type MyActivity = {
  hidden: boolean;
  offerUntil: string | null;
  boostUntil: string | null;
  eligible: boolean;
};

export function activityDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
