import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { bookingCalendarDownload } from "../src/modules/bookings/calendar-download";

const booking = {
  id: "b1",
  startsAt: "2026-10-25T01:30:00+00:00",
  endsAt: "2026-10-25T02:30:00+00:00",
  summary: "Hair with Jo",
  description: "Booked through GLOHAUS.",
};
const generatedAt = new Date("2026-11-12T20:00:00Z");
function parsed(value: string) {
  return new ICAL.Component(ICAL.parse(value)).getFirstSubcomponent("vevent")!;
}
describe("booking calendar download", () => {
  it("includes required event properties and preserves UTC instants across clock changes", () => {
    const event = parsed(bookingCalendarDownload(booking, generatedAt));
    expect(event.getFirstPropertyValue("uid")).toBe("glohaus-b1");
    expect(String(event.getFirstPropertyValue("dtstamp"))).toBe("2026-11-12T20:00:00Z");
    expect(String(event.getFirstPropertyValue("dtstart"))).toBe("2026-10-25T01:30:00Z");
    const summer = parsed(bookingCalendarDownload({ ...booking,
      startsAt: "2026-06-01T10:00:00+01:00", endsAt: "2026-06-01T11:00:00+01:00",
    }, generatedAt));
    expect(String(summer.getFirstPropertyValue("dtstart"))).toBe("2026-06-01T09:00:00Z");
  });
  it("round-trips delimiters and CR/LF as text instead of injected event properties", () => {
    const summary = "Jo\\Salon, hair; nails\rATTENDEE:someone@example.com\r\nNew line\nLast";
    const data = bookingCalendarDownload({ ...booking, summary }, generatedAt);
    const event = parsed(data);
    expect(event.getAllProperties("attendee")).toHaveLength(0);
    expect(event.getFirstPropertyValue("summary")).toBe(summary.replace(/\r\n|\r/g, "\n"));
    expect(data.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("folds UTF-8 lines without splitting multibyte characters or losing content", () => {
    const summary = "💅é".repeat(70);
    const data = bookingCalendarDownload({ ...booking, summary }, generatedAt);
    for (const line of data.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parsed(data).getFirstPropertyValue("summary")).toBe(summary);
  });
});
