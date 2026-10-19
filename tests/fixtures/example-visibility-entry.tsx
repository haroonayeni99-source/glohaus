import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { OwnerExampleProfiles } from "@/components/owner-example-profiles";
import { ExampleProfessionalListings } from "@/components/example-professional-listings";
import { profileExamples } from "@/modules/professionals/examples";
import {
  defaultExampleVisibility,
  exampleListings,
  type ExampleVisibility,
} from "@/modules/professionals/example-visibility";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import { emptyTaxonomy } from "@/modules/taxonomy/domain";
const read = (): ExampleVisibility =>
  JSON.parse(
    localStorage.getItem("example-visibility") ||
      JSON.stringify(defaultExampleVisibility),
  );
document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") || "light";
window.fetch = async (url, init) => {
  if (
    String(url) !== "/api/v1/admin/profile-examples" ||
    init?.method !== "PUT"
  )
    throw Error("Unexpected fixture mutation");
  const failure = sessionStorage.getItem("example-failure");
  if (failure) {
    sessionStorage.removeItem("example-failure");
    return Response.json(
      { error: { code: failure } },
      { status: failure === "MFA_REQUIRED" ? 403 : 503 },
    );
  }
  localStorage.setItem("example-visibility", String(init.body));
  window.dispatchEvent(new Event("visibility-saved"));
  return Response.json({ saved: true });
};
function App() {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener("visibility-saved", sync);
    return () => window.removeEventListener("visibility-saved", sync);
  }, []);
  return (
    <main style={{ maxWidth: 1000, margin: "auto", padding: 20 }}>
      <section className="admin-detail-card">
        <h1>Example profiles</h1>
        <OwnerExampleProfiles
          initial={read()}
          profiles={profileExamples.map(({ slug, name, category }) => ({
            slug,
            name,
            category,
          }))}
        />
      </section>
      <h2>Public listing preview</h2>
      <ExampleProfessionalListings
        examples={exampleListings(
          value,
          "",
          defaultDiscoveryFilters,
          emptyTaxonomy,
        )}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
