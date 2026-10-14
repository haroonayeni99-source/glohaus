// Fictional local browser fixture. No authentication or production requests.
import React from "react";
import { createRoot } from "react-dom/client";
import { AdminProfessionalActivity } from "@/components/admin-professional-activity";
import { ProfessionalActivityStatus } from "@/components/professional-activity-status";
import { AdminNavigation } from "@/components/admin-navigation";
import { AdminWorkspaceView } from "@/components/admin-workspace-view";
import type {
  ActivityOverview,
  MyActivity,
} from "@/modules/professional-activity/domain";
const params = new URLSearchParams(location.search);
const role = params.get("role") || "owner";
document.documentElement.dataset.theme = params.get("theme") || "light";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  business_name: "Maya Beauty Studio " + "X".repeat(100),
  slug: "maya-studio",
  publication_status: "published",
  last_activity_at: "2026-07-01T10:00:00Z",
  activity_source: "website_visit" as const,
  inactive_days: 30,
  stage: 30,
  warning_at: null,
  can_hide: false,
  hidden_at: null,
  can_offer: true,
  offer_until: null,
  boost_until: null,
  upcoming_bookings: 2,
};
let activity: ActivityOverview = {
  asOf: "2026-10-14T12:00:00Z",
  page: 0,
  total: 2,
  rows: [
    row,
    {
      ...row,
      id: "22222222-2222-4222-8222-222222222222",
      business_name: "Inactive Studio",
      inactive_days: 67,
      stage: 60,
      warning_at: "2026-10-01T10:00:00Z",
      can_hide: true,
      can_offer: false,
    },
  ],
  email: { pending: 2, accepted: 3, cancelled: 1, exhausted: 0 },
};
let mine: MyActivity = {
  hidden: false,
  offerUntil: "2026-10-28T12:00:00Z",
  boostUntil: null,
  eligible: true,
};
sessionStorage.setItem("activity-fixture-requests", "[]");
window.fetch = async (url, init) => {
  if (init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    const requests = JSON.parse(
      sessionStorage.getItem("activity-fixture-requests") || "[]",
    );
    requests.push(body);
    sessionStorage.setItem(
      "activity-fixture-requests",
      JSON.stringify(requests),
    );
    if (String(url).includes("/admin/professional-activity")) {
      activity = {
        ...activity,
        rows: activity.rows.map((pro) =>
          pro.id !== body.professionalId
            ? pro
            : body.action === "offer_boost"
              ? {
                  ...pro,
                  can_offer: false,
                  offer_until: "2026-10-28T12:00:00Z",
                }
              : {
                  ...pro,
                  hidden_at:
                    body.action === "hide" ? "2026-10-14T12:00:00Z" : null,
                  can_hide: body.action === "restore",
                },
        ),
      };
    } else
      mine = { ...mine, offerUntil: null, boostUntil: "2026-10-21T12:00:00Z" };
    return Response.json({ saved: true });
  }
  if (String(url).includes("/admin/professional-activity"))
    return Response.json(activity);
  if (String(url).includes("/professional/activity"))
    return Response.json(mine);
  throw Error("Unexpected fixture request");
};
const account = {
  id: row.id,
  authId: "fixture",
  email: "fixture@example.test",
  displayName: "Fixture Owner",
  status: "active" as const,
  roles: [role === "admin" ? ("admin" as const) : ("owner" as const)],
  professionalId: null,
};
createRoot(document.getElementById("root")!).render(
  role === "professional" ? (
    <main className="pro-main">
      <ProfessionalActivityStatus initial={mine} />
    </main>
  ) : (
    <main className="admin-workspace">
      <AdminNavigation account={account} />
      <AdminWorkspaceView>
        <section
          id="professional-activity"
          className="admin-workspace-section admin-detail-card"
        >
          <h1>Inactive Professionals</h1>
          <AdminProfessionalActivity
            initial={activity}
            owner={role === "owner"}
          />
        </section>
      </AdminWorkspaceView>
    </main>
  ),
);
