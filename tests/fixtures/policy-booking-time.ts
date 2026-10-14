// Keep one-hour fixture appointments within a London calendar day, including
// when the suite runs late at night. Short-notice tests retain their near-term
// slots; long-notice dates remain at least the requested number of hours away.
export function policyBookingTime(hours = 72) {
  const start = new Date(
    Math.ceil((Date.now() + hours * 3600000) / 900000) * 900000,
  );
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hourCycle: "h23",
    }).format(start),
  );
  if (hour === 23) start.setTime(start.getTime() + 2 * 3600000);
  return start.toISOString();
}
