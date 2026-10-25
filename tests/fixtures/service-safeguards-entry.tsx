import React from "react";
import { createRoot } from "react-dom/client";
import { OwnerServiceSafeguards } from "@/components/owner-service-safeguards";
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
createRoot(document.getElementById("root")!).render(
  <main className="public-info-page">
    <OwnerServiceSafeguards
      professionals={[
        {
          id: "11111111-1111-4111-8111-111111111111",
          business_name: "Fictional Studio",
        },
      ]}
    />
  </main>,
);
