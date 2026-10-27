import "server-only";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
export type ExternalBusy = { key: string; start: string; end: string };
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 || b === 0 || (b === 88 && c === 99) || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:db8|0|10|20):/i.test(address) &&
      !/^2002:/i.test(address)
    );
  return false;
}
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
  const url = feedUrl(value),
    addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("FEED_UNSUPPORTED");
  const address = addresses[0];
  // Pin the validated DNS result for the TLS connection; never follow redirects.
  return new Promise<string>((resolve, reject) => {
    // A private agent avoids global environment proxies or pooled connections
    // bypassing the validated DNS address. TLS still verifies the original host.
    const agent = new https.Agent({ keepAlive: false });
    let settled = false;
    const finish = (error?: Error, body?: string) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      if (error) reject(error);
      else resolve(body!);
    };
    const request = https.get(
      url,
      {
        family: address.family,
        agent,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "text/calendar" },
      },
      (response) => {
        response.on("error", () => finish(Error("SYNC_FAILED")));
        response.on("aborted", () => finish(Error("SYNC_FAILED")));
        if (response.statusCode !== 200) {
          response.resume();
          finish(Error("SYNC_FAILED"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) {
            finish(Error("FEED_UNSUPPORTED"));
            response.destroy(Error("FEED_UNSUPPORTED"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          finish(undefined, Buffer.concat(chunks).toString("utf8")),
        );
      },
    );
    request.on("error", () => finish(Error("SYNC_FAILED")));
  });
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
