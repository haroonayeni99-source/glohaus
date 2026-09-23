import type { TimeOff } from "./domain";
const londonDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function calendarDate(value: string | number | Date) {
  const parts = Object.fromEntries(
    londonDate
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
/** End-exclusive time off: an interval ending at midnight does not block the next day. */
export function blocksOnDate(date: string, blocks: TimeOff[]) {
  return blocks.filter(
    (block) =>
      calendarDate(block.startsAt) <= date &&
      calendarDate(Date.parse(block.endsAt) - 1) >= date,
  );
}
export function calendarDays(month: string) {
  const [year, number] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    offset,
    dates: Array.from(
      { length: count },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  };
}
