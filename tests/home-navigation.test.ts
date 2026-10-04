import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesktopCustomerHome } from "@/components/desktop-customer-home";
import { SiteFooter } from "@/components/site-footer";
import { readFileSync, existsSync } from "node:fs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

describe("public homepage navigation", () => {
  it("presents an anonymous visitor with join/sign-in, without private account panels or invented recommendations", () => {
    const html = renderToStaticMarkup(React.createElement(DesktopCustomerHome));
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-up?intent=professional"');
    expect(html).not.toContain("Upcoming Booking");
    expect(html).not.toContain("Good afternoon");
    expect(html).not.toContain("Sienna Beauty");
    expect(html).not.toContain("desktop-rating");
  });
  it("preserves a real signed-in session with account access and sign out", () => {
    const html = renderToStaticMarkup(
      React.createElement(DesktopCustomerHome, {
        signedIn: true,
        displayName: "Alex",
      }),
    );
    expect(html).toContain("Alex");
    expect(html).toContain("Sign out");
    expect(html).toContain('href="/workspace"');
    expect(html).toContain("Upcoming Booking");
  });
  it("connects every footer destination to an existing route", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));
    expect(html).toContain("Terms &amp; conditions");
    expect(html).toContain("Privacy policy");
    for (const match of html.matchAll(/href="(\/[^"?#]*)/g)) {
      const route = match[1];
      const direct = `src/app${route === "/" ? "" : route}/page.tsx`;
      const signup =
        route === "/sign-up" &&
        existsSync("src/app/sign-up/[[...sign-up]]/page.tsx");
      expect(existsSync(direct) || signup, route).toBe(true);
    }
  });
  it("keeps professional preview inside the correctly themed container", () => {
    expect(
      readFileSync("src/app/professional-preview/page.tsx", "utf8"),
    ).toContain('className="pro-main pro-preview-main"');
  });
});
