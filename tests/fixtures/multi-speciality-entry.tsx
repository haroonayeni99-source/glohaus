// Fictional UI fixtures; real ownership, reservation and payment behaviour is
// exercised separately through the PostgreSQL and API acceptance suites.
import React from "react";
import { createRoot } from "react-dom/client";
import { ProfessionalEditor } from "@/components/professional-editor";
import { ProfessionalProfile } from "@/components/professional-profile";
import { BookingPicker } from "@/components/booking-picker";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { DiscoveryFeed } from "@/components/discovery-feed";
import { AdminTaxonomyManager } from "@/components/admin-taxonomy-manager";
import { HomepageCategoryMediaControl } from "@/components/homepage-category-media-control";
import {
  taxonomy,
  selection,
  professional,
  services,
  details,
  tid,
} from "./multi-speciality-data";
import { defaultPolicy } from "@/modules/policies/domain";
import { discoveryOptions } from "@/modules/professionals/discovery";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme =
  params.get("theme") ?? localStorage.getItem("glohaus-theme") ?? "light";
localStorage.setItem("glohaus-theme", document.documentElement.dataset.theme);
window.fetch = async (url, init) => {
  const path = String(url);
  const requests = JSON.parse(
    sessionStorage.getItem("taxonomy-requests") || "[]",
  );
  requests.push({
    url: path,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });
  sessionStorage.setItem("taxonomy-requests", JSON.stringify(requests));
  if (path.includes("/policies?")) {
    const p = new URL(path, location.origin).searchParams;
    const svc = services.find((s) => s.id === p.get("serviceId"))!;
    const variation = svc.options?.find((o) => o.id === p.get("variationId"));
    const extras =
      svc.options?.filter((o) => p.getAll("extraId").includes(o.id)) ?? [];
    const price =
      (variation?.pricePence ?? svc.price_pence) +
      extras.reduce((n, o) => n + o.pricePence, 0);
    return Response.json({
      earlyServiceBefore: new Date(Date.now() + 14 * 86400000).toISOString(),
      policy: {
        token: "a".repeat(32),
        generalVersionId: null,
        serviceVersionId: null,
        rules: defaultPolicy,
        generalCustomRules: "",
        serviceCustomRules: "",
        timezone: "Europe/London",
        pricePence: price,
        depositPence: Math.round(price * 0.3),
        bookingFeePence: 100,
        fullPrepayment: false,
        publishedAt: null,
        serviceOptions: {
          serviceId: svc.id,
          variationId: variation?.id ?? null,
          variationName: variation?.name ?? null,
          extraIds: extras.map((o) => o.id),
          extraNames: extras.map((o) => o.name),
          pricePence: price,
          depositPence: Math.round(price * 0.3),
          durationMinutes:
            (variation?.durationMinutes ?? svc.duration_minutes) +
            extras.reduce((n, o) => n + o.durationMinutes, 0),
        },
      },
    });
  }
  if (path.includes("/availability?")) {
    const p = new URL(path, location.origin).searchParams;
    return Response.json({ slots: [`${p.get("date")}T12:00:00.000Z`] });
  }
  if (path === "/api/v1/bookings")
    return Response.json({ url: "/booking-confirmed" });
  return Response.json({ saved: true, service: { id: tid(19) }, selection });
};
const specialities = taxonomy.specialities
  .filter((s) => selection.specialityIds.includes(s.id))
  .map((s) => ({
    speciality_id: s.id,
    name: s.name,
    category_name: "Hair",
    is_primary: s.id === selection.primarySpecialityId,
  }));
const selected =
  location.pathname === "/discover"
    ? params.get("specialityId")
    : params.get("speciality");
let content: React.ReactNode;
if (location.pathname === "/professional/services")
  content = (
    <main className="pro-main">
      <h1>Services & prices</h1>
      <ProfessionalEditor
        section="services"
        services={services}
        taxonomy={taxonomy}
        selection={selection}
        verificationStatus="verified"
        assets={[]}
        marketplaceCategories={taxonomy.categories}
      />
    </main>
  );
else if (location.pathname === "/explore") {
  const { query, filters } = discoveryOptions(Object.fromEntries(params));
  const matching = services.filter(
    (s) =>
      (!filters.specialityId || s.speciality_id === filters.specialityId) &&
      (!filters.templateId || s.template_id === filters.templateId) &&
      (!query ||
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        (query === "retwst" && s.name === "Retwist")),
  );
  content = (
    <ExploreMapExperience
      query={query}
      filters={filters}
      taxonomy={taxonomy}
      professionals={
        matching.length
          ? [
              {
                ...professional,
                matching_services: matching.map((s) => ({
                  id: s.id,
                  name: s.name,
                  speciality_id: s.speciality_id!,
                  speciality_name: s.speciality_name!,
                  price_pence: s.price_pence,
                  duration_minutes: s.duration_minutes,
                })),
                popular_services: matching.map((s) => s.name),
              },
            ]
          : []
      }
    />
  );
} else if (location.pathname === "/admin")
  content = (
    <main className="admin-main">
      <h1>Catalogue controls</h1>
      <AdminTaxonomyManager
        data={{ ...taxonomy, coverage: [], services: [] }}
      />
      <HomepageCategoryMediaControl taxonomy={taxonomy} />
    </main>
  );
else if (location.pathname === "/discover")
  content = (
    <DiscoveryFeed
      routeBase="/discover"
      hideEditorial
      taxonomy={taxonomy}
      taxonomySelection={{ specialityId: selected ?? undefined }}
      publishedPosts={services
        .filter((s) => !selected || s.speciality_id === selected)
        .map((s) => ({
          id: s.id,
          professional_id: professional.id,
          slug: professional.slug,
          business_name: professional.business_name,
          category: "Hair",
          city: "London",
          title: s.name + " finishing",
          body: "A fictional service tutorial for catalogue interface checks.",
          kind: "tutorial",
          service_id: s.id,
          service_name: s.name,
          price_pence: s.price_pence,
          speciality_id: s.speciality_id,
          speciality_name: s.speciality_name,
        }))}
    />
  );
else if (location.pathname === "/booking-confirmed")
  content = (
    <main>
      <h1>Booking request received</h1>
      <p>Fictional checkout only.</p>
    </main>
  );
else
  content = (
    <ProfessionalProfile
      professional={professional}
      details={details}
      services={services}
      specialities={specialities}
      selectedSpeciality={selected}
      selectedService={params.get("service") ?? undefined}
      assets={[
        {
          id: tid(15),
          alt_text: "Loc portfolio example",
          media_type: "image",
          speciality_ids: [tid(4)],
        },
        {
          id: tid(16),
          alt_text: "Braiding portfolio example",
          media_type: "image",
          speciality_ids: [tid(3)],
        },
      ]}
      reviews={[
        {
          id: tid(17),
          rating: 5,
          body: "A brilliant loc maintenance appointment.",
          public_name: "Alex",
          service_id: tid(12),
          service_name: "Retwist",
          speciality_id: tid(4),
          speciality_name: "Locs",
        },
      ]}
      hours={[{ weekday: 1, startMinute: 540, endMinute: 1020 }]}
      rating={5}
      reviewCount={1}
      follow={{ following: false, followerCount: 1, signedIn: false }}
      messageHref={null}
      bookingFeePence={100}
      presentation={{
        profile_style: "signature",
        portfolio_layout: "grid",
        service_style: "cards",
      }}
      booking={
        <BookingPicker
          services={services}
          ready
          returnPath="/p/multi-studio"
          professionalName="Multi Studio"
          bookingFeePence={100}
          verificationStatus="verified"
          initialSelection={{ serviceId: params.get("service") ?? undefined }}
        />
      }
    />
  );
createRoot(document.getElementById("root")!).render(<>{content}</>);
