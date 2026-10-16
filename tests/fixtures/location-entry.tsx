import React from "react";
import { createRoot } from "react-dom/client";
import { ProfessionalLocationEditor } from "@/components/professional-location-editor";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import { distanceMiles } from "@/modules/professionals/location";
import type { PublicProfessional } from "@/modules/professionals/domain";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const professionals: PublicProfessional[] = [
  {
    id: "near",
    slug: "near-studio",
    business_name: "Nearby Studio",
    bio: "An independent studio.",
    city: "London",
    category: "Hair",
    public_latitude: 51.5074,
    public_longitude: -0.128,
    public_location_confirmed_at: "2026-10-11",
    rating: 4.8,
  },
  {
    id: "far",
    slug: "far-studio",
    business_name: "Further Studio",
    bio: "An independent studio.",
    city: "London",
    category: "Nails",
    public_latitude: 51.61,
    public_longitude: -0.12,
    public_location_confirmed_at: "2026-10-11",
  },
  {
    id: "area",
    slug: "area-studio",
    business_name: "Area Only Studio",
    bio: "An independent studio.",
    city: "London",
    category: "Hair",
  },
];
let saved: unknown = null;
let locationReads = 0;
const browserFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const requestUrl = url instanceof Request ? url.url : String(url);
  if (requestUrl.startsWith("https://tile.openstreetmap.org/")) return browserFetch(url, init);
  const requests = JSON.parse(
    sessionStorage.getItem("location-requests") ?? "[]",
  );
  requests.push({
    url: String(url),
    method: init?.method ?? "GET",
    body: init?.body,
  });
  sessionStorage.setItem("location-requests", JSON.stringify(requests));
  if (String(url).includes("api.postcodes.io"))
    return Response.json({ result: { latitude: 51.501, longitude: -0.141 } });
  if (String(url).includes("/profile/location")) {
    if (init?.method === "PUT") {
      if (params.has("failure"))
        return Response.json({ error: true }, { status: 503 });
      const body = JSON.parse(String(init.body));
      saved = body.confirmed ? { ...body, confirmed_at: "2026-10-11" } : null;
      return Response.json({ saved: true });
    }
    if (params.has("loadFailure") && locationReads++ === 0)
      return Response.json({ error: true }, { status: 503 });
    return Response.json({ location: saved });
  }
  if (String(url).includes("/explore/nearby")) {
    if (params.has("failure"))
      return Response.json({ error: true }, { status: 503 });
    if (params.has("slow"))
      await new Promise((resolve) => setTimeout(resolve, 250));
    const body = JSON.parse(String(init?.body));
    return Response.json({
      professionals: professionals
        .filter((pro) => pro.public_location_confirmed_at)
        .map((pro) => ({
          ...pro,
          distance_miles: distanceMiles(body, {
            latitude: pro.public_latitude!,
            longitude: pro.public_longitude!,
          }),
        }))
        .filter((pro) => pro.distance_miles <= body.radiusMiles)
        .sort((a, b) => a.distance_miles - b.distance_miles),
      truncated: false,
    });
  }
  throw new Error("Unexpected fixture request");
};
createRoot(document.getElementById("root")!).render(
  location.pathname.includes("professional") ? (
    <div style={{ maxWidth: 850, margin: "auto" }}>
      <ProfessionalLocationEditor />
    </div>
  ) : (
    <ExploreMapExperience
      professionals={professionals}
      query=""
      filters={defaultDiscoveryFilters}
    />
  ),
);
