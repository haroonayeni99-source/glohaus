import "server-only";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { fetchPublicBytes } from "./public-fetch";
export { publicAddress } from "./public-fetch";
export type ExternalBusy = { key: string; start: string; end: string };
export function feedUrl(value: string) {
  const url = new URL(value.replace(/^webcal:/, "https:"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash ||
    value.length > 2048 ||
    isIP(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw Error("FEED_UNSUPPORTED");
  return url;
}
export async function fetchFeed(value: string) {
  const url = feedUrl(value);
  return (await fetchPublicBytes(url)).toString("utf8");
}
function instant(time: ICAL.Time, end = false) {
  if (!time.isDate && time.zone.tzid !== "floating")
    return time.toJSDate().getTime();
  // DATE and floating values are interpreted in GLOHAUS's existing UK business timezone.
  const date = time.toString().slice(0, 10),
    hour = time.isDate ? 0 : time.hour,
    minute = time.isDate ? 0 : time.minute,
    second = time.isDate ? 0 : time.second;
  const target = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  const guessed = Date.parse(`${target}Z`),
    formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  const matches = [guessed, guessed - 3600000].filter(
    (x) => formatter.format(x).replace(" ", "T") === target,
  );
  if (!matches.length) throw Error("FEED_UNSUPPORTED");
  return end ? Math.max(...matches) : Math.min(...matches);
}
export function parseFeed(
  text: string,
  start: number,
  end: number,
): ExternalBusy[] {
  const calendar = new ICAL.Component(ICAL.parse(text));
  if (calendar.name !== "vcalendar") throw Error("FEED_UNSUPPORTED");
  const components = calendar.getAllSubcomponents("vevent"),
    masters = new Map<string, ICAL.Event>(),
    exceptions: ICAL.Event[] = [];
  if (components.length > 4000) throw Error("FEED_UNSUPPORTED");
  for (const component of components) {
    for (const prop of ["dtstart", "dtend", "recurrence-id"]) {
      const zone = component.getFirstProperty(prop)?.getParameter("tzid");
      if (zone && zone !== "UTC" && !calendar.getTimeZoneByID(String(zone)))
        throw Error("FEED_UNSUPPORTED");
    }
    const event = new ICAL.Event(component);
    if (!event.uid) throw Error("FEED_UNSUPPORTED");
    if (event.isRecurrenceException()) exceptions.push(event);
    else {
      const prior = masters.get(event.uid);
      if (
        !prior ||
        Number(event.component.getFirstPropertyValue("sequence") || 0) >=
          Number(prior.component.getFirstPropertyValue("sequence") || 0)
      )
        masters.set(event.uid, event);
    }
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (!master) throw Error("FEED_UNSUPPORTED");
    master.relateException(exception);
  }
  const result = new Map<string, ExternalBusy>();
  let count = 0;
  const add = (
    event: ICAL.Event,
    from: ICAL.Time,
    to: ICAL.Time,
    key: string,
  ) => {
    if (
      String(event.component.getFirstPropertyValue("status")).toUpperCase() ===
        "CANCELLED" ||
      String(event.component.getFirstPropertyValue("transp")).toUpperCase() ===
        "TRANSPARENT"
    )
      return;
    const a = instant(from),
      b = instant(to, true);
    if (b <= a) throw Error("FEED_UNSUPPORTED");
    if (a < end && b > start) {
      const hashed = createHash("sha256").update(key).digest("hex");
      result.set(hashed, {
        key: hashed,
        start: new Date(a).toISOString(),
        end: new Date(b).toISOString(),
      });
    }
  };
  for (const event of masters.values()) {
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let occurrence: ICAL.Time | null;
      while ((occurrence = iterator.next())) {
        if (++count > 15000) throw Error("FEED_UNSUPPORTED");
        if (instant(occurrence) > end) break;
        const item = event.getOccurrenceDetails(occurrence);
        add(
          item.item,
          item.startDate,
          item.endDate,
          `${event.uid}:${occurrence.toString()}`,
        );
      }
    } else add(event, event.startDate, event.endDate, event.uid);
  }
  if (result.size > 3000) throw Error("FEED_UNSUPPORTED");
  return [...result.values()];
}
