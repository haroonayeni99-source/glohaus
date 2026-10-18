import React from "react";
import { createRoot } from "react-dom/client";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { AdminCategoryManager } from "@/components/admin-category-manager";
import { ProfessionalProductsManager } from "@/components/professional-products-manager";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import { emptyTaxonomy } from "@/modules/taxonomy/domain";
import { distanceMiles } from "@/modules/professionals/location";
import type { PublicProfessional } from "@/modules/professionals/domain";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const category = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Hair",
  slug: "hair",
  active: true,
  sort_order: 10,
};
const pros: PublicProfessional[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "brixton-braids",
    business_name: "Brixton Braids",
    bio: "Independent braiding, locs and natural hair specialist.",
    city: "Brixton",
    category: "Hair",
    verification_status: "verified",
    identity_verified: true,
    professional_verified: true,
    rating: 4.9,
    review_count: 42,
    photo_id: "photo-one",
    from_price_pence: 4500,
    public_latitude: 51.462,
    public_longitude: -0.115,
    public_location_confirmed_at: "2026-10-10",
    next_available_at: "2026-10-19T09:00:00Z",
    matching_services: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Knotless Braids",
        speciality_id: null,
        speciality_name: "Braiding",
        price_pence: 4500,
        duration_minutes: 120,
      },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    slug: "nails-and-glow",
    business_name: "Nails & Glow",
    bio: "Precision nail care.",
    city: "Peckham",
    category: "Nails",
    verification_status: "verified",
    business_verified: true,
    rating: 4.8,
    review_count: 17,
    from_price_pence: 2500,
    public_latitude: 51.474,
    public_longitude: -0.069,
    public_location_confirmed_at: "2026-10-10",
    travels_to_you: true,
    matching_services: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Gel Manicure",
        speciality_id: null,
        speciality_name: "Gel Nails",
        price_pence: 2500,
        duration_minutes: 60,
      },
    ],
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    slug: "area-studio",
    business_name: "Area Studio",
    bio: "An area-only professional with no shared public pin.",
    city: "Camden",
    category: "Hair",
    from_price_pence: 3500,
  },
];
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const browserFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const path = url instanceof Request ? url.url : String(url);
  if (path.startsWith("https://tile.openstreetmap.org/")) return browserFetch(url, init);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  localStorage.setItem(
    "discovery-last-request",
    JSON.stringify({ path, body }),
  );
  if (path.startsWith("/api/v1/follows")) {
    const states = stored<Record<string, unknown>>("discovery-follows", {});
    if (init?.method === "PUT") {
      const value = {
        following: body.following,
        followerCount: body.following ? 5 : 4,
      };
      states[body.professionalId] = value;
      localStorage.setItem("discovery-follows", JSON.stringify(states));
      return Response.json(value);
    }
    return Response.json({ states });
  }
  if (path.startsWith("/api/v1/explore/professionals/"))
    return Response.json({
      professional: pros[0],
      services: pros[0].matching_services,
      assets: [
        {
          id: "portfolio-image",
          alt_text: "Braiding portfolio",
          media_type: "image",
        },
        {
          id: "portfolio-video",
          alt_text: "Braiding process",
          media_type: "video",
        },
      ],
    });
  if (path === "/api/v1/explore/nearby")
    return Response.json({
      professionals: pros
        .filter((p) => p.public_location_confirmed_at)
        .map((p) => ({
          ...p,
          distance_miles: distanceMiles(body, {
            latitude: p.public_latitude!,
            longitude: p.public_longitude!,
          }),
        }))
        .filter((p) => p.distance_miles <= body.radiusMiles)
        .sort((a, b) => a.distance_miles - b.distance_miles),
      truncated: false,
    });
  if (path === "/api/v1/admin/product-categories") {
    if (params.has("fail")) return Response.json({}, { status: 503 });
    const categories = stored("discovery-categories", [category]);
    const id = body.id ?? crypto.randomUUID();
    localStorage.setItem(
      "discovery-categories",
      JSON.stringify([
        ...categories.filter((c) => c.id !== id),
        {
          id,
          name: body.name,
          slug: body.slug,
          active: body.active,
          sort_order: body.sortOrder,
        },
      ]),
    );
    return Response.json({ id, saved: true });
  }
  if (path.includes("/api/v1/professional/products")) {
    return Response.json({
      product: {
        id: crypto.randomUUID(),
        name: body.name,
        category_id: body.categoryId,
        description: body.description,
        price_pence: body.pricePence,
        stock_quantity: body.stockQuantity,
        publication_status: body.publicationStatus,
        image_asset_id: null,
      },
    });
  }
  return Response.json({}, { status: 404 });
};
const categories = stored("discovery-categories", [category]);
createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/admin") ? (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: 18 }}>
      <h1>Product categories</h1>
      <AdminCategoryManager initial={categories} productMode />
    </main>
  ) : location.pathname.startsWith("/professional") ? (
    <div className="pro-app">
      <ProfessionalProductsManager
        initialProducts={[]}
        assets={[]}
        accessStatus="verified"
        categories={categories}
      />
    </div>
  ) : (
    <ExploreMapExperience
      signedIn
      professionals={params.has("unavailable") ? [] : pros}
      loadFailed={params.has("unavailable")}
      query=""
      filters={defaultDiscoveryFilters}
      taxonomy={{
        ...emptyTaxonomy,
        categories: [
          {
            ...category,
            description: "",
            image_url: null,
            legacy_only: false,
            canonical_category_id: null,
          },
        ],
      }}
    />
  ),
);
