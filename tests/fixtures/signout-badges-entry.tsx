import React from "react";
import { createRoot } from "react-dom/client";
import { AccountControls } from "@/components/account-controls";
import { ProfessionalCard } from "@/components/professional-card";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
const professional = { id: "test-pro", slug: "test-studio", business_name: "Test Studio", bio: "A fictional studio for verification layout checks.", category: "Nails", city: "London", verification_status: "verified" as const, business_verified: true, professional_verified: true };
createRoot(document.getElementById("root")!).render(<main style={{ padding: 20, maxWidth: 1100, margin: "auto" }}>
  <h1>Sign-out and verification checks</h1>
  <section data-testid="standard"><AccountControls /></section>
  <section className="admin-workspace" style={{ display: "block", margin: "20px 0" }}><div className="admin-navigation-bottom" style={{ display: "block" }} data-testid="admin"><AccountControls /></div></section>
  <section className="mobile-site-menu" style={{ position: "static", display: "block" }}><div className="mobile-menu-signout" data-testid="mobile"><AccountControls /></div></section>
  <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 20, marginTop: 20 }}>
    <ProfessionalCard professional={professional} />
    <ProfessionalCard professional={{ ...professional, id: "identity", business_name: "Identity Only", business_verified: false, professional_verified: false }} />
    <ProfessionalCard professional={{ ...professional, id: "restricted", business_name: "Restricted Studio", verification_status: "restricted" }} />
  </section>
</main>);
