import { it, expect } from "vitest";
import {
  arrivalActionSchema,
  departureTime,
  lateness,
  directionsUrl,
} from "@/modules/arrival/domain";
it("calculates departure from appointment instant, duration and buffer across a DST boundary", () => {
  expect(departureTime("2026-10-25T02:00:00+00:00", 35, 10)).toBe(
    "2026-10-25T01:15:00.000Z",
  );
});
it.each([
  ["13:59", "On time"],
  ["14:00", "On time"],
  ["14:07", "Within the grace period"],
  ["14:10", "Within the grace period"],
  ["14:15", "Outside the grace period"],
])("classifies %s using the accepted grace period", (at, label) => {
  expect(lateness("2026-10-18T14:00:00Z", `2026-10-18T${at}:00Z`, 10)).toBe(
    label,
  );
});
it("keeps route origins in an explicit directions URL and encodes them safely", () => {
  const u = new URL(
    directionsUrl(
      { latitude: 51.5, longitude: -0.12 },
      "Home & work?",
      "transit",
    ),
  );
  expect(u.hostname).toBe("www.google.com");
  expect(u.searchParams.get("origin")).toBe("Home & work?");
  expect(u.searchParams.get("travelmode")).toBe("transit");
});
it("refuses forged timestamps, ownership fields and plan origins", () => {
  expect(
    arrivalActionSchema.safeParse({ action: "manual", arrivalAt: "2026-01-01" })
      .success,
  ).toBe(false);
  expect(
    arrivalActionSchema.safeParse({
      action: "consent",
      enabled: true,
      customerId: "victim",
    }).success,
  ).toBe(false);
  expect(
    arrivalActionSchema.safeParse({
      action: "plan",
      durationMinutes: 20,
      bufferMinutes: 10,
      mode: "walking",
      reminders: true,
      origin: "Private address",
    }).success,
  ).toBe(false);
});
