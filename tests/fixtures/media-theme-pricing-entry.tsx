import React from "react";
import { createRoot } from "react-dom/client";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { ProfessionalPlanCards } from "@/components/professional-plan-cards";
import { ProfessionalPlanActions } from "@/components/professional-plan-actions";
import { defaultPlans } from "@/modules/professionals/plan-pricing";
import ProfessionalPreviewPage from "@/app/professional-preview/page";
// Fictional accounts and local requests only; never creates a checkout or upload.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
window.fetch = async (url, init) => {
  sessionStorage.setItem("last-request", JSON.stringify({ url: String(url), body: init?.body }));
  return Response.json({ id: "fictional-profile-image" }, { status: 201 });
};
async function render() {
  const preview = await ProfessionalPreviewPage({ searchParams: Promise.resolve({}) });
  createRoot(document.getElementById("root")!).render(
    location.pathname === "/preview" ? preview :
    <main className="pro-main pro-management-page">
      <h1>Profile and professional plans</h1>
      <ProfilePhotoEditor photo={null} published={false} />
      <ProfessionalPlanCards plans={defaultPlans} currentPlan="starter" />
      <ProfessionalPlanActions currentPlan="starter" hasBillingCustomer={false}
        offers={defaultPlans.filter(p => p.key !== "starter").map(p => ({ ...p, priceId: `price_fixture_${p.key}`, ready: true }))} />
    </main>
  );
}
void render();
