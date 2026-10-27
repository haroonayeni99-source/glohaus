import "server-only";
import type { Provider } from "./domain";
import type { Tokens } from "./oauth";
import { providerJson } from "./oauth";
import { fetchFeed, parseFeed, type ExternalBusy } from "./ics";
function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
export async function calendarBusy(
  provider: Provider,
  tokens: Tokens,
  start: string,
  end: string,
  exportedIds: Set<string>,
): Promise<ExternalBusy[]> {
  if (provider === "ics")
    return parseFeed(
      await fetchFeed(tokens.feedUrl!),
      Date.parse(start),
      Date.parse(end),
    );
  const results: ExternalBusy[] = [];
  if (provider === "google") {
    const base = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    base.search = new URLSearchParams({
      timeMin: start,
      timeMax: end,
      singleEvents: "true",
      maxResults: "1000",
      fields: "items(id,status,transparency,start,end),nextPageToken,timeZone",
    }).toString();
    let page = "";
    for (let i = 0; i < 10; i++) {
      if (page) base.searchParams.set("pageToken", page);
      const data = await providerJson(base.toString(), {
        headers: bearer(tokens.accessToken),
      });
      if (!Array.isArray(data.items)) throw Error("SYNC_FAILED");
      for (const item of data.items) {
        if (
          item.status === "cancelled" ||
          item.transparency === "transparent" ||
          exportedIds.has(item.id)
        )
          continue;
        const from = googleTime(item.start, data.timeZone),
          to = googleTime(item.end, data.timeZone);
        results.push({
          key: String(item.id).slice(0, 256),
          start: from,
          end: to,
        });
      }
      page = data.nextPageToken || "";
      if (!page) return results;
    }
  } else if (provider === "outlook") {
    let next =
      "https://graph.microsoft.com/v1.0/me/calendarView?" +
      new URLSearchParams({
        startDateTime: start,
        endDateTime: end,
        $top: "1000",
        $select: "id,start,end,showAs,isCancelled",
      });
    for (let i = 0; i < 10; i++) {
      const url = new URL(next);
      if (
        url.origin !== "https://graph.microsoft.com" ||
        !url.pathname.startsWith("/v1.0/me/calendarView")
      )
        throw Error("SYNC_FAILED");
      const data = await providerJson(url.toString(), {
        headers: {
          ...bearer(tokens.accessToken),
          Prefer: 'outlook.timezone="UTC"',
        },
      });
      if (!Array.isArray(data.value)) throw Error("SYNC_FAILED");
      for (const item of data.value) {
        if (
          item.isCancelled ||
          item.showAs === "free" ||
          exportedIds.has(item.id)
        )
          continue;
        results.push({
          key: item.id,
          start: outlookTime(item.start),
          end: outlookTime(item.end),
        });
      }
      next = data["@odata.nextLink"] || "";
      if (!next) return results;
    }
  }
  throw Error("SYNC_FAILED"); // Never replace a snapshot with incomplete pagination.
}
function googleTime(
  value: { dateTime?: string; date?: string; timeZone?: string },
  calendarZone?: string,
) {
  if (value?.dateTime && Number.isFinite(Date.parse(value.dateTime)))
    return new Date(value.dateTime).toISOString();
  // Google DATE boundaries use the calendar timezone; require it instead of guessing.
  if (value?.date) {
    const zone = value.timeZone || calendarZone;
    if (zone !== "Europe/London" && zone !== "UTC")
      throw Error("FEED_UNSUPPORTED");
    const utc = Date.parse(`${value.date}T00:00:00Z`);
    if (zone === "UTC") return new Date(utc).toISOString();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      hourCycle: "h23",
    });
    return new Date(
      Number(formatter.format(utc)) === 1 ? utc - 3600000 : utc,
    ).toISOString();
  }
  throw Error("SYNC_FAILED");
}
function outlookTime(value: { dateTime: string; timeZone: string }) {
  if (!value?.dateTime || !["UTC", "Etc/UTC"].includes(value.timeZone))
    throw Error("SYNC_FAILED");
  return new Date(
    /[zZ]|[+-]\d\d:\d\d$/.test(value.dateTime)
      ? value.dateTime
      : `${value.dateTime}Z`,
  ).toISOString();
}
export type ExportBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
export async function exportBooking(
  provider: Provider,
  tokens: Tokens,
  booking: ExportBooking,
  eventId?: string,
) {
  const headers = bearer(tokens.accessToken),
    cancelled = !["confirmed", "completed"].includes(booking.status);
  const base =
    provider === "google"
      ? "https://www.googleapis.com/calendar/v3/calendars/primary/events"
      : "https://graph.microsoft.com/v1.0/me/events";
  const stableId = `gh${booking.id.replaceAll("-", "")}`;
  const id = eventId || (provider === "google" ? stableId : null);
  if (cancelled) {
    if (id) {
      const response = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok && ![404, 410].includes(response.status))
        throw Error("SYNC_FAILED");
    }
    return null;
  }
  const body =
    provider === "google"
      ? {
          summary: "GLOHAUS appointment",
          visibility: "private",
          start: { dateTime: new Date(booking.starts_at).toISOString() },
          end: { dateTime: new Date(booking.ends_at).toISOString() },
          ...(eventId ? {} : { id: stableId }),
        }
      : {
          subject: "GLOHAUS appointment",
          sensitivity: "private",
          showAs: "busy",
          start: {
            dateTime: new Date(booking.starts_at).toISOString(),
            timeZone: "UTC",
          },
          end: {
            dateTime: new Date(booking.ends_at).toISOString(),
            timeZone: "UTC",
          },
          ...(!eventId ? { transactionId: booking.id } : {}),
        };
  if (eventId) {
    const result = await providerJson(
      `${base}/${encodeURIComponent(eventId)}`,
      { method: "PATCH", headers, body: JSON.stringify(body) },
    );
    return String(result.id);
  }
  const response = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 409 && provider === "google") {
    const update = { ...body };
    delete (update as { id?: string }).id;
    const result = await providerJson(`${base}/${stableId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(update),
    });
    return String(result.id);
  }
  if (!response.ok)
    throw Error(
      [401, 403].includes(response.status)
        ? "RECONNECT_REQUIRED"
        : "SYNC_FAILED",
    );
  const result = await response.json();
  if (!result.id) throw Error("SYNC_FAILED");
  return String(result.id);
}
