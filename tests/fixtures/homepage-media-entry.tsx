import React from "react";
import { createRoot } from "react-dom/client";
import { HomepageMediaControl } from "@/components/homepage-media-control";
import { HomepageCategoryMediaControl } from "@/components/homepage-category-media-control";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { MobileCustomerHome } from "@/components/mobile-customer-home";
import type { HomepageCategoryImages } from "@/modules/platform/homepage-images";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const images: HomepageCategoryImages = JSON.parse(
  localStorage.getItem("category-images") || "{}",
);
const names = JSON.parse(localStorage.getItem("category-names") || "{}");
const heroes = JSON.parse(
  localStorage.getItem("hero-images") ||
    '{"desktopHero":null,"mobileHero":null}',
);
window.fetch = async (url, init) => {
  const requests = JSON.parse(sessionStorage.getItem("requests") || "[]");
  requests.push({ url: String(url), body: init?.body });
  sessionStorage.setItem("requests", JSON.stringify(requests));
  const failure = sessionStorage.getItem("fail-next-save");
  if (failure && String(url).endsWith("/categories")) {
    sessionStorage.removeItem("fail-next-save");
    return Response.json(
      { error: { code: failure } },
      { status: failure === "MFA_REQUIRED" ? 403 : 503 },
    );
  }
  if (String(url).endsWith("/upload"))
    return Response.json(
      { url: "https://images.example.test/uploaded-nails.webp" },
      { status: 201 },
    );
  const body = JSON.parse(String(init?.body));
  if (String(url).endsWith("/categories")) {
    localStorage.setItem("category-images", JSON.stringify(body.images));
    localStorage.setItem("category-names", JSON.stringify(body.names));
  } else
    localStorage.setItem(
      "hero-images",
      JSON.stringify({
        desktopHero: body.desktopHero,
        mobileHero: body.mobileHero,
      }),
    );
  return Response.json({ saved: true });
};
createRoot(document.getElementById("root")!).render(
  location.pathname === "/home" ? (
    <>
      <DesktopCustomerHome
        homepageMedia={{
          ...heroes,
          categoryImages: images,
          categoryNames: names,
        }}
      />
      <MobileCustomerHome
        homepageMedia={{
          ...heroes,
          categoryImages: images,
          categoryNames: names,
        }}
      />
    </>
  ) : (
    <main id="main" className="admin-page">
      <section id="homepage-media" className="admin-detail-card">
        <h2>Homepage and category images</h2>
        <HomepageMediaControl initial={heroes} />
        <HomepageCategoryMediaControl initial={images} initialNames={names} />
      </section>
    </main>
  ),
);
