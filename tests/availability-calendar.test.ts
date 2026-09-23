import { describe, expect, it } from "vitest";
import {
  blocksOnDate,
  calendarDate,
  calendarDays,
} from "../src/modules/availability/calendar";
describe("London availability calendar", () => {
  it("uses London dates rather than the viewing device timezone", () => {
    expect(calendarDate("2026-06-01T23:30:00Z")).toBe("2026-06-02");
    expect(calendarDate("2026-12-01T23:30:00Z")).toBe("2026-12-01");
  });
  it("does not include the day after a midnight end, including BST", () => {
    const blocks = [
      {
        id: "a",
        label: "Holiday",
        startsAt: "2026-06-01T23:00:00Z",
        endsAt: "2026-06-02T23:00:00Z",
      },
    ];
    expect(blocksOnDate("2026-06-02", blocks)).toHaveLength(1);
    expect(blocksOnDate("2026-06-03", blocks)).toHaveLength(0);
  });
  it("shows overnight breaks on both affected days", () => {
    const blocks = [
      {
        id: "a",
        label: "Break",
        startsAt: "2026-10-24T22:00:00Z",
        endsAt: "2026-10-25T02:00:00Z",
      },
    ];
    expect(blocksOnDate("2026-10-24", blocks)).toHaveLength(1);
    expect(blocksOnDate("2026-10-25", blocks)).toHaveLength(1);
  });
  it("handles leap years and Monday-first alignment", () => {
    expect(calendarDays("2028-02").dates).toHaveLength(29);
    expect(calendarDays("2026-06").offset).toBe(0);
    expect(calendarDays("2026-02").offset).toBe(6);
  });
});
