// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PageLoading } from "@/components/page-loading";
import { readFileSync } from "node:fs";
vi.mock("next/navigation", () => ({
  usePathname: () => "/shop",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
it("renders data-free local placeholders and usable navigation without replaying branding", () => {
  for (const area of [
    "home",
    "discover",
    "shop",
    "profile",
    "account",
    "service",
  ] as const) {
    const html = renderToStaticMarkup(
      React.createElement(PageLoading, { area }),
    );
    expect(html).toContain("data-glohaus-route-pending");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Mobile navigation"');
    expect(html).toContain('href="/shop"');
    expect(html).not.toContain("glohaus-route-loading");
    expect(html).not.toContain("glohaus-intro");
  }
});
it("covers each requested dynamic route with its own loading boundary", () => {
  for (const path of [
    "discover",
    "shop",
    "p/[slug]",
    "p/[slug]/services/[id]",
    "account",
  ])
    expect(readFileSync(`src/app/${path}/loading.tsx`, "utf8")).toContain(
      "PageLoading",
    );
});
it("streams the document shell outside slow identity and label lookups", () => {
  const source = readFileSync("src/app/layout.tsx", "utf8");
  expect(source).toContain("<Suspense fallback={<PageLoading />}");
  expect(source).toContain("<PlatformContent>{children}</PlatformContent>");
  const root = source.slice(
    source.indexOf("export default async function RootLayout"),
  );
  expect(root).not.toContain("publicLabels()");
  expect(root).not.toContain("publicViewerSignedIn()");
  expect(root).toContain("<EngagementPreferences />");
});
