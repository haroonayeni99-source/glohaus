import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BookingNavigation } from "@/components/booking-navigation";

const css = readFileSync("src/app/theme-controls.css", "utf8");

function declarations(selector: string) {
  const at = css.indexOf(selector);
  expect(at, `Missing theme rule: ${selector}`).toBeGreaterThan(-1);
  const start = css.indexOf("{", at);
  const end = css.indexOf("}", start);
  const body = css.slice(start + 1, end);
  return Object.fromEntries([...body.matchAll(/([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)]
    .map((match) => [match[1], match[2]]));
}
function luminance(hex: string) {
  const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset + 1, offset + 3), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(foreground: string, background: string) {
  const fg = luminance(foreground), bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}
const scope = ".pro-app .pro-bookings-list-panel ";
const night = ':root[data-theme="night"] ' + scope;
const light = ':root:not([data-theme="night"]) ' + scope;

it("renders the Upcoming, History and All appointment tabs with the correct current state", () => {
  const props: React.ComponentProps<typeof BookingNavigation> = {
    view: "upcoming",
    base: "/professional/bookings",
    next: null,
    after: false,
    children: React.createElement("div", null, "No appointments"),
  };
  const html = renderToStaticMarkup(React.createElement(BookingNavigation, props));
  expect(html).toContain('aria-label="Appointment views"');
  expect(html).toMatch(/<a\b[^>]*aria-current="page"[^>]*>Upcoming<\/a>/);
  expect(html).toContain("History");
  expect(html).toContain("All appointments");
});

it("keeps selected and unselected booking tabs readable in light and night themes", () => {
  for (const prefix of [light, night]) {
    const normal = declarations(prefix + ".booking-view-tabs a");
    const selected = declarations(prefix + '.booking-view-tabs a[aria-current="page"]');
    expect(contrast(normal.color, normal.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(selected.color, selected.background)).toBeGreaterThanOrEqual(4.5);
  }
});

it("keeps booking descriptions and headings readable on their actual card surfaces", () => {
  for (const prefix of [light, night]) {
    const card = declarations(prefix + ".appointment-card");
    const heading = declarations(prefix + ".appointment-card :is(h3, strong)");
    const detail = declarations(prefix + ".appointment-card :is(p, small, .appointment-time, .appointment-detail-label)");
    expect(contrast(heading.color, card.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(detail.color, card.background)).toBeGreaterThanOrEqual(4.5);
  }
  const date = declarations(night + ".appointment-date");
  expect(contrast(date.color, date.background)).toBeGreaterThanOrEqual(4.5);
  const empty = declarations(night + ".catalog-empty");
  const emptyText = declarations(night + ".catalog-empty :is(h2, p, a)");
  expect(contrast(emptyText.color, empty.background)).toBeGreaterThanOrEqual(4.5);
});
