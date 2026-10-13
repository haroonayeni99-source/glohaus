import React from "react";
import { AdminNavigation } from "@/components/admin-navigation";
import { AdminWorkspaceView } from "@/components/admin-workspace-view";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { createRoot } from "react-dom/client";
import { CommissionControlCentre } from "@/components/commission-control-centre";
import { ProfessionalCommissionPanel } from "@/components/professional-commission-panel";
import type {
  CommissionOverview,
  ProfessionalCommissionOverview,
} from "@/modules/commission/domain";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
if (!params.has("professional")) location.hash = "professional-commission";
const pro = "11111111-1111-4111-8111-111111111111";
const rule = "22222222-2222-4222-8222-222222222222";
const effective = {
  basisPoints: 800,
  standardBasisPoints: 800,
  ruleId: null,
  ruleReference: "standard:starter",
  pricingVersion: "commission-v2-baseline",
  expiresAt: null,
};
const founder = {
  professional_id: pro,
  trial_rule_id: rule,
  reward_rule_id: null,
  questionnaire: null,
  submitted_at: null,
  qualified_at: null,
};
const data: CommissionOverview = {
  asOf: "2026-10-13T20:00:00Z",
  settings: {
    enabled: params.has("active"),
    new_promotions_enabled: true,
    version: 1,
  },
  professionals: [
    {
      id: pro,
      name: "Fictional Beauty Studio with a long business name",
      effective,
    },
  ],
  rules: [
    {
      id: rule,
      kind: "platform",
      professional_id: null,
      scope: "all",
      basis_points: 200,
      starts_at: "2026-10-15T10:00:00Z",
      ends_at: "2026-11-15T10:00:00Z",
      cancelled_from: null,
      reason: "Fictional scheduled launch offer",
      created_by: "owner-fixture",
      created_at: "2026-10-13T20:00:00Z",
    },
  ],
  founding: [founder],
  metrics: {
    commissionEarnedPence: 400,
    waivedPence: 300,
    paymentCostsPence: 52,
    capturedPence: 2100,
    costsPending: 1,
    legacyWithoutTerms: 0,
  },
  performance: [
    {
      rule_reference: rule,
      paid_bookings: 1,
      waived_pence: 300,
      earned_pence: 100,
      provider_cost_pence: 52,
    },
  ],
  audit: [
    {
      actor_user_id: "owner-fixture",
      action: "commission.create",
      reason: "Fictional launch offer",
      previous_state: {},
      new_state: { basis_points: 200, scope: "all" },
      created_at: "2026-10-13T20:00:00Z",
    },
  ],
};
const professional: ProfessionalCommissionOverview = {
  effective,
  enabled: true,
  notices: [
    {
      body: "Your service commission becomes 2% on 15 October until 15 November. Existing bookings keep agreed rates.",
      effective_at: "2026-10-15T10:00:00Z",
      created_at: "2026-10-13T20:00:00Z",
    },
  ],
  founding: founder,
  bookings: [
    {
      booking_id: "booking-fixture",
      basis_points: 200,
      commission_pence: 100,
      rule_reference: rule,
      pricing_version: "commission-v2",
      agreed_at: "2026-10-13T20:00:00Z",
    },
  ],
};
createRoot(document.getElementById("root")!).render(
  params.has("professional") ? (
    <div className="pro-app">
      <ProfessionalNavigation
        active="wallet"
        displayName="Fictional Professional"
      />
      <main id="main" className="pro-main pro-management-page">
        <h1>Your commission and founding rewards</h1>
        <ProfessionalCommissionPanel data={professional} />
      </main>
    </div>
  ) : (
    <main id="main" className="admin-workspace">
      <AdminNavigation
        account={{
          id: pro,
          authId: "fictional-owner",
          email: "owner@example.test",
          displayName: "Fictional Owner",
          status: "active",
          roles: ["owner", "admin"],
          professionalId: null,
        }}
      />
      <AdminWorkspaceView>
        <section
          id="professional-commission"
          className="admin-workspace-section admin-detail-card"
        >
          <h1>Commission Control Centre</h1>
          <CommissionControlCentre data={data} />
        </section>
      </AdminWorkspaceView>
    </main>
  ),
);
