import { describe, it, expect } from "vitest";
import {
  timeOffInterval,
  appointmentSlots,
  scheduleSchema,
} from "@/modules/availability/domain";
const now = Date.parse("2026-10-01T00:00:00Z");
describe("London appointment availability", () => {
  it("does not offer a closed day", () =>
    expect(appointmentSlots("2026-10-26", 60, [], [], now)).toEqual([]));
  it("uses GMT after the autumn clock change", () => {
    const slots = appointmentSlots(
      "2026-10-26",
      60,
      [{ weekday: 1, startMinute: 540, endMinute: 660 }],
      [],
      now,
    );
    expect(slots[0]).toBe("2026-10-26T09:00:00.000Z");
    expect(slots.at(-1)).toBe("2026-10-26T10:00:00.000Z");
  });
  it("uses BST before the autumn clock change", () => {
    expect(
      appointmentSlots(
        "2026-10-19",
        60,
        [{ weekday: 1, startMinute: 540, endMinute: 600 }],
        [],
        now,
      ),
    ).toEqual(["2026-10-19T08:00:00.000Z"]);
  });
  it("retains distinct instants in the repeated autumn hour", () => {
    const slots = appointmentSlots(
      "2026-10-25",
      15,
      [{ weekday: 0, startMinute: 60, endMinute: 120 }],
      [],
      now,
    );
    expect(slots).toContain("2026-10-25T00:00:00.000Z");
    expect(slots).toContain("2026-10-25T01:00:00.000Z");
    expect(new Set(slots).size).toBe(8);
  });
  it("does not cross outside hours during a repeated clock interval", () => {
    expect(
      appointmentSlots(
        "2026-10-25",
        75,
        [{ weekday: 0, startMinute: 90, endMinute: 105 }],
        [],
        now,
      ),
    ).toEqual([]);
  });
  it("never offers the missing spring hour", () => {
    const slots = appointmentSlots(
      "2027-03-28",
      15,
      [{ weekday: 0, startMinute: 60, endMinute: 120 }],
      [],
      Date.parse("2027-03-01T00:00:00Z"),
    );
    expect(slots).toEqual([]);
  });
  it("subtracts appointments and private time off with half-open bounds", () => {
    const slots = appointmentSlots(
      "2026-10-26",
      60,
      [{ weekday: 1, startMinute: 540, endMinute: 720 }],
      [
        {
          start: Date.parse("2026-10-26T10:00:00Z"),
          end: Date.parse("2026-10-26T11:00:00Z"),
        },
      ],
      now,
    );
    expect(slots).toEqual([
      "2026-10-26T09:00:00.000Z",
      "2026-10-26T11:00:00.000Z",
    ]);
  });
  it("enforces one-hour notice and a 90-day horizon", () => {
    expect(
      appointmentSlots(
        "2026-10-26",
        60,
        [{ weekday: 1, startMinute: 540, endMinute: 600 }],
        [],
        Date.parse("2026-10-26T08:01:00Z"),
      ),
    ).toEqual([]);
    expect(
      appointmentSlots(
        "2027-10-25",
        60,
        [{ weekday: 1, startMinute: 540, endMinute: 600 }],
        [],
        now,
      ),
    ).toEqual([]);
  });
  it("rejects impossible dates and duplicate weekdays", () => {
    expect(() => appointmentSlots("2026-02-30", 60, [], [], now)).toThrow(
      "INVALID_DATE",
    );
    expect(
      scheduleSchema.safeParse({
        rules: [
          { weekday: 1, startMinute: 540, endMinute: 600 },
          { weekday: 1, startMinute: 600, endMinute: 660 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("whole-day London time off", () => {
  it("includes the complete last day with the correct summer offset", () => {
    expect(
      timeOffInterval({
        startDate: "2027-07-01",
        endDate: "2027-07-02",
        label: "Holiday",
      }),
    ).toEqual({
      startsAt: "2027-06-30T23:00:00.000Z",
      endsAt: "2027-07-02T23:00:00.000Z",
      label: "Holiday",
    });
  });
  it("covers 23 hours on the spring transition and 25 in autumn", () => {
    for (const [date, hours] of [
      ["2027-03-28", 23],
      ["2026-10-25", 25],
    ] as const) {
      const block = timeOffInterval({
        startDate: date,
        endDate: date,
        label: "Closed",
      });
      expect(Date.parse(block.endsAt) - Date.parse(block.startsAt)).toBe(
        hours * 3600000,
      );
    }
  });
  it("rejects impossible, reversed and excessively long ranges", () => {
    for (const [startDate, endDate] of [
      ["2027-02-30", "2027-03-01"],
      ["2027-07-02", "2027-07-01"],
      ["2027-01-01", "2029-01-01"],
    ])
      expect(() =>
        timeOffInterval({ startDate, endDate, label: "Closed" }),
      ).toThrow();
  });
});

describe("partial-day London time off", () => {
  it("converts summer lunch breaks without blocking the rest of the day", () => {
    const block = timeOffInterval({
      startDate: "2027-07-01",
      endDate: "2027-07-01",
      startTime: "12:00",
      endTime: "13:00",
      label: "Lunch",
    });
    expect(block.startsAt).toBe("2027-07-01T11:00:00.000Z");
    expect(block.endsAt).toBe("2027-07-01T12:00:00.000Z");
    const slots = appointmentSlots(
      "2027-07-01",
      60,
      [{ weekday: 4, startMinute: 600, endMinute: 900 }],
      [{ start: Date.parse(block.startsAt), end: Date.parse(block.endsAt) }],
      Date.parse("2027-06-30T00:00:00Z"),
    );
    expect(slots).toContain("2027-07-01T10:00:00.000Z");
    expect(slots).not.toContain("2027-07-01T10:15:00.000Z");
    expect(slots).not.toContain(block.startsAt);
    expect(slots).toContain(block.endsAt);
  });
  it("uses GMT in winter and supports overnight time off", () => {
    expect(
      timeOffInterval({
        startDate: "2027-01-01",
        endDate: "2027-01-02",
        startTime: "22:00",
        endTime: "08:00",
        label: "Closed",
      }),
    ).toMatchObject({
      startsAt: "2027-01-01T22:00:00.000Z",
      endsAt: "2027-01-02T08:00:00.000Z",
    });
  });
  it.each([
    { startTime: "12:00" },
    { startTime: "13:00", endTime: "12:00" },
    { startTime: "12:00", endTime: "12:00" },
    { startTime: "25:00", endTime: "26:00" },
    { startTime: "bad", endTime: "13:00" },
  ])("rejects invalid or incomplete hours %j", (times) => {
    expect(() =>
      timeOffInterval({
        startDate: "2027-07-01",
        endDate: "2027-07-01",
        label: "Break",
        ...times,
      }),
    ).toThrow();
  });
  it.each(["2027-03-28", "2026-10-25"])(
    "rejects ambiguous or nonexistent clock-change times on %s",
    (date) => {
      expect(() =>
        timeOffInterval({
          startDate: date,
          endDate: date,
          startTime: "01:30",
          endTime: "03:00",
          label: "Break",
        }),
      ).toThrow();
    },
  );
});
