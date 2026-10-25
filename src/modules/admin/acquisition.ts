export const sourceLabels: Record<string, string> = {
  existing_professional: "Existing professional client",
  new_professional: "New client brought by professional",
  glohaus: "GLOHAUS-acquired",
  unknown: "Unknown",
  disputed: "Disputed / conflicting evidence",
};
export type AcquisitionOverview = {
  uniqueCustomers: number;
  rows: {
    professional_id: string;
    business_name: string;
    origin: string;
    bookings: number;
    customers: number;
    returning_bookings: number;
    returning_customers: number;
    first_bookings: number;
    supported_bookings: number;
    service_value_pence: number | string;
    net_captured_pence: number | string;
    commission_pence: number | string;
  }[];
  cases: {
    customer_id: string;
    professional_id: string;
    business_name: string;
    declared_source: string;
    resolution: string | null;
    recorded_at: string;
    invitation_before_booking: boolean;
    consented_view_before_booking: boolean;
    history: { source: string; reason: string; createdAt: string }[];
  }[];
};
