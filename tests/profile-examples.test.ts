// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, access } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import {
  profileExamples,
  findProfileExample,
} from "@/modules/professionals/examples";
import { ProfessionalProfile } from "@/components/professional-profile";
import ExamplesPage from "@/app/profile-examples/page";
import ExamplePage, {
  generateMetadata,
} from "@/app/profile-examples/[slug]/page";
vi.mock("@/lib/public-viewer", () => ({
  publicViewerSignedIn: async () => false,
}));
vi.mock("@/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("@/components/bottom-navigation", () => ({
  BottomNavigation: () => null,
}));
vi.mock("@/components/follow-professional-button", () => ({
  FollowProfessionalButton: () => React.createElement("button", null, "Follow"),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: (props: object) => React.createElement("a", props),
}));
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { src, alt, width, height }),
}));
function html(node: React.ReactNode) {
  const el = document.createElement("div");
  el.innerHTML = renderToStaticMarkup(node);
  return el;
}

it("provides ten unique fictional profiles covering all eight current categories and each supported presentation", async () => {
  expect(profileExamples).toHaveLength(10);
  expect(new Set(profileExamples.map((p) => p.slug)).size).toBe(10);
  expect(new Set(profileExamples.map((p) => p.category)).size).toBe(8);
  expect(new Set(profileExamples.map((p) => p.style.profile_style))).toEqual(
    new Set(["signature", "minimal", "editorial"]),
  );
  expect(new Set(profileExamples.map((p) => p.style.portfolio_layout))).toEqual(
    new Set(["grid", "feature"]),
  );
  expect(new Set(profileExamples.map((p) => p.style.service_style))).toEqual(
    new Set(["cards", "clean"]),
  );
  for (const p of profileExamples) {
    expect(p.professional.id).toMatch(/^example-/);
    expect(p.professional.verification_status).toBeUndefined();
    expect(p.services.length).toBeGreaterThanOrEqual(3);
    expect(
      p.services.every((s) => s.deposit_pence <= s.price_pence * 0.4),
    ).toBe(true);
    for (const src of Object.values(p.mediaSources))
      await access(`public${src}`);
  }
});
it.each(profileExamples)(
  "renders $name using the real storefront without exposing live business actions",
  async (p) => {
    const el = html(
      await ExamplePage({
        params: Promise.resolve({ slug: p.slug }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(el.querySelector("h1")?.textContent).toBe(p.name);
    expect(el.textContent).toContain("FICTIONAL BUSINESS");
    expect(el.textContent).toContain(
      "This fictional profile has no customer reviews",
    );
    expect(
      el.querySelectorAll(".professional-gallery img").length,
    ).toBeGreaterThanOrEqual(2);
    expect(el.querySelectorAll(".service-list article")).toHaveLength(3);
    expect(el.querySelector("#professional-policies")).not.toBeNull();
    expect(
      el.querySelectorAll("button, form, script[type='application/ld+json']"),
    ).toHaveLength(0);
    const links = [...el.querySelectorAll("a")].map(
      (a) => a.getAttribute("href") ?? "",
    );
    expect(
      links.every(
        (h) => !/^\/p\/|^\/api\/|^\/messages|^https?:|^tel:|^mailto:/.test(h),
      ),
    ).toBe(true);
    expect(
      el.querySelector("#services .taxonomy-tabs a")?.getAttribute("href"),
    ).toBe(`${p.path}#services`);
    expect(
      await generateMetadata({ params: Promise.resolve({ slug: p.slug }) }),
    ).toMatchObject({ robots: { index: false, follow: false } });
  },
);
it("filters examples by category and style, and handles empty or invalid filters", async () => {
  const count = async (query: { category?: string; style?: string }) =>
    html(
      await ExamplesPage({ searchParams: Promise.resolve(query) }),
    ).querySelectorAll(".profile-example-card").length;
  expect(await count({})).toBe(10);
  expect(await count({ category: "Hair" })).toBe(3);
  expect(await count({ style: "minimal" })).toBe(3);
  expect(await count({ category: "Brows", style: "minimal" })).toBe(0);
  expect(await count({ category: "<script>", style: "invalid" })).toBe(10);
});
it("previews a selected service and speciality without a checkout or a real profile redirect", async () => {
  const p = profileExamples[0];
  const s = p.services[1];
  const el = html(
    await ExamplePage({
      params: Promise.resolve({ slug: p.slug }),
      searchParams: Promise.resolve({
        service: s.id,
        speciality: s.speciality_id!,
      }),
    }),
  );
  expect(el.querySelector("#booking h2")?.textContent).toBe(s.name);
  expect(el.querySelectorAll(".service-list article")).toHaveLength(1);
  expect(
    el.querySelectorAll(".profile-service-book")[0].getAttribute("href"),
  ).toBe(`?service=${s.id}#booking`);
  await expect(
    ExamplePage({
      params: Promise.resolve({ slug: "unknown" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("NOT_FOUND");
  expect(findProfileExample("unknown")).toBeUndefined();
});
it("preserves the live profile booking, follow, service-details and review routes when example mode is absent", () => {
  const p = profileExamples[0];
  const el = html(
    React.createElement(ProfessionalProfile, {
      professional: p.professional,
      details: p.details,
      services: p.services,
      assets: [],
      reviews: [],
      hours: p.hours,
      rating: null,
      reviewCount: 0,
      follow: { following: false, followerCount: 0, signedIn: false },
      messageHref: "/messages",
      bookingFeePence: 100,
      presentation: p.style,
      booking: React.createElement("p", null, "Live booking picker"),
    }),
  );
  expect(el.querySelector("button")?.textContent).toBe("Follow");
  expect(el.querySelector(".professional-book-button")?.textContent).toContain(
    "Book an appointment",
  );
  expect(
    [...el.querySelectorAll(".service-list a")].some(
      (a) =>
        a.getAttribute("href") === `/p/${p.slug}/services/${p.services[0].id}`,
    ),
  ).toBe(true);
  expect(el.querySelector("form")?.getAttribute("action")).toBe(`/p/${p.slug}`);
  expect(
    el.querySelector(".profile-service-book")?.getAttribute("href"),
  ).toContain("?bookService=");
  expect(el.textContent).not.toContain(
    "This fictional profile has no customer reviews",
  );
});
it("leaves account creation and marketplace mutations out of the examples", async () => {
  for (const path of [
    "src/app/profile-examples/page.tsx",
    "src/app/profile-examples/[slug]/page.tsx",
    "src/modules/professionals/examples.ts",
  ]) {
    const source = await readFile(path, "utf8");
    expect(source).not.toMatch(
      /createUser|enrolAccount|withIdentity|INSERT INTO|stripe\(|fetch\(/,
    );
  }
});
