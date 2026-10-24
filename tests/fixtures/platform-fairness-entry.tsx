import React from "react";
import { createRoot } from "react-dom/client";
import { FoundingProgrammeControls } from "@/components/founding-programme-controls";
import {
  CustomerSourceConfirmation,
  ProfessionalSourceChallenge,
} from "@/components/customer-source-confirmation";
import { SupportTicket } from "@/components/support-ticket";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
import { AcquisitionReport } from "@/components/acquisition-report";
import { ReviewResponseForm } from "@/components/review-response-form";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
const id = "11111111-1111-4111-8111-111111111111";
const data = {
  programme: {
    state:
      query.get("state") === "retired"
        ? ("retired" as const)
        : ("open" as const),
    updated_at: "2026-10-24T12:00:00Z",
    retired_at: null,
  },
  pricingDraft: {
    status: "draft" as const,
    professional_basis_points: 200,
    platform_first_basis_points: 800,
    returning_basis_points: 200,
  },
};
const view = query.get("view") ?? "owner";
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
    {view === "owner" && <FoundingProgrammeControls data={data} />}
    {view === "source" && (
      <>
        <CustomerSourceConfirmation bookingId={id} />
        <ProfessionalSourceChallenge bookingId={id} />
      </>
    )}
    {view === "ticket" && <SupportTicket id={id} />}
    {view === "support" && (
      <AdminSupportInbox
        initial={[
          {
            id,
            name: "Fictional Customer",
            email: "fixture@example.test",
            topic: "Booking",
            reference: "",
            message: "Fictional appointment support with evidence",
            status: "open",
            created_at: "2026-10-24T12:00:00Z",
          },
        ]}
      />
    )}
    {view === "review" && <ReviewResponseForm reviewId={id} body="" />}
    {view === "report" && (
      <AcquisitionReport
        data={{
          uniqueCustomers: 1,
          cases: [],
          rows: [
            {
              professional_id: id,
              business_name: "Fictional professional with a long business name",
              origin: "unknown",
              bookings: 1,
              customers: 1,
              returning_bookings: 0,
              returning_customers: 0,
              first_bookings: 1,
              supported_bookings: 0,
              service_value_pence: 5000,
              net_captured_pence: 2100,
              commission_pence: 400,
            },
          ],
        }}
      />
    )}
  </main>,
);
