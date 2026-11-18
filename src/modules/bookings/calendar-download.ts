// RFC 5545 sections 3.1, 3.3.11 and 3.6.1. This is a download, not a sync feed.
function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function calendarDate(value: string | Date) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += size;
  }
  return result;
}

export function bookingCalendarDownload(booking: {
  id: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  description: string;
}, generatedAt = new Date()) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GLOHAUS//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${escapeText(`glohaus-${booking.id}`)}`,
    `DTSTAMP:${calendarDate(generatedAt)}`,
    `DTSTART:${calendarDate(booking.startsAt)}`,
    `DTEND:${calendarDate(booking.endsAt)}`,
    `SUMMARY:${escapeText(booking.summary)}`,
    `DESCRIPTION:${escapeText(booking.description)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].map(foldLine).join("\r\n") + "\r\n";
}
