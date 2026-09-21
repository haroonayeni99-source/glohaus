import { z } from "zod";
import { overlaps } from "@/modules/bookings/domain";
export const ruleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1425).multipleOf(15),
    endMinute: z.number().int().min(15).max(1440).multipleOf(15),
  })
  .strict()
  .refine((rule) => rule.endMinute > rule.startMinute, {
    message: "Closing time must be after opening time",
  });
export const scheduleSchema = z
  .object({ rules: z.array(ruleSchema).max(7) })
  .strict()
  .refine(
    (value) =>
      new Set(value.rules.map((r) => r.weekday)).size === value.rules.length,
    { message: "Choose one working period per day" },
  );
export const blockSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    label: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine((block) => Date.parse(block.endsAt) > Date.parse(block.startsAt), {
    message: "End must be after start",
  });
export type Rule = z.infer<typeof ruleSchema>;
export type BusyInterval = { start: number; end: number };
const london = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function localParts(timestamp: number) {
  const parts = Object.fromEntries(
    london.formatToParts(timestamp).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
export function appointmentSlots(
  date: string,
  durationMinutes: number,
  rules: Rule[],
  busy: BusyInterval[],
  now: number,
): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("INVALID_DATE");
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 480 ||
    !Number.isFinite(now)
  )
    throw new Error("INVALID_DURATION_OR_CLOCK");
  scheduleSchema.parse({ rules });
  for (const block of busy)
    if (
      !Number.isFinite(block.start) ||
      !Number.isFinite(block.end) ||
      block.end <= block.start
    )
      throw new Error("INVALID_BUSY_INTERVAL");
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const rule = rules.find((rule) => rule.weekday === weekday);
  if (!rule) return [];
  const slots: string[] = [];
  // Iterate UTC instants rather than guessing a fixed London offset: DST gaps vanish, repeated hours retain distinct UTC IDs.
  for (
    let start = midnight - 2 * 3600000;
    start < midnight + 26 * 3600000;
    start += 15 * 60000
  ) {
    const end = start + durationMinutes * 60000;
    const first = localParts(start);
    const last = localParts(end);
    if (
      first.date !== date ||
      start < now + 3600000 ||
      start > now + 90 * 86400000
    )
      continue;
    const endMinute =
      last.date === date
        ? last.minute
        : last.date ===
              new Date(midnight + 86400000).toISOString().slice(0, 10) &&
            last.minute === 0
          ? 1440
          : -1;
    if (
      first.minute < rule.startMinute ||
      endMinute < 0 ||
      endMinute > rule.endMinute ||
      first.minute >= rule.endMinute
    )
      continue;
    let inside = true;
    for (let instant = start; instant < end; instant += 15 * 60000) {
      const local = localParts(instant);
      if (
        local.date !== date ||
        local.minute < rule.startMinute ||
        local.minute >= rule.endMinute
      ) {
        inside = false;
        break;
      }
    }
    if (!inside || busy.some((block) => overlaps({ start, end }, block)))
      continue;
    slots.push(new Date(start).toISOString());
  }
  return slots;
}
export const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function clockTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function londonInstant(date: string, time: string): string | null {
  const utc = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(utc)) return null;
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const matches = [utc, utc - 3600000].filter((instant) => {
    const local = localParts(instant);
    return local.date === date && local.minute === minute;
  });
  // Reject missing or repeated clock-change times rather than guessing.
  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}
const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const timeOffSchema = z
  .object({
    startDate: z.iso.date(),
    startTime: localTime.optional(),
    endTime: localTime.optional(),
    endDate: z.iso.date(),
    label: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine(
    (value) =>
      value.endDate >= value.startDate &&
      Date.parse(value.endDate) - Date.parse(value.startDate) <= 365 * 86400000,
    { message: "Choose an end date on or after the start, within one year." },
  )
  .superRefine((value, context) => {
    if (value.startTime === undefined && value.endTime === undefined) return;
    if (!value.startTime || !value.endTime) {
      context.addIssue({
        code: "custom",
        message: "Choose both a start and end time.",
      });
      return;
    }
    const start = londonInstant(value.startDate, value.startTime);
    const end = londonInstant(value.endDate, value.endTime);
    if (!start || !end)
      context.addIssue({
        code: "custom",
        message:
          "This time is missing or repeated when the clocks change. Choose a different time.",
      });
    else if (end <= start)
      context.addIssue({
        code: "custom",
        message: "End time must be after start time.",
      });
  });
export type TimeOffInput = z.infer<typeof timeOffSchema>;
export type TimeOff = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
};
export function timeOffInterval(input: TimeOffInput) {
  const parsed = timeOffSchema.parse(input);
  if (parsed.startTime && parsed.endTime)
    return {
      startsAt: londonInstant(parsed.startDate, parsed.startTime)!,
      endsAt: londonInstant(parsed.endDate, parsed.endTime)!,
      label: parsed.label,
    };
  const midnight = (date: string) => {
    const utc = Date.parse(`${date}T00:00:00Z`);
    // London midnight is unambiguous even on clock-change days.
    for (const instant of [utc, utc - 3600000]) {
      const local = localParts(instant);
      if (local.date === date && local.minute === 0)
        return new Date(instant).toISOString();
    }
    throw new Error("INVALID_DATE");
  };
  const nextDay = new Date(Date.parse(`${parsed.endDate}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    startsAt: midnight(parsed.startDate),
    endsAt: midnight(nextDay),
    label: parsed.label,
  };
}
