import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export const consentCookie = "glohaus_analytics_consent";
export const consentVersion = "1";
export function engagementEnabled() {
  return (
    process.env.ENGAGEMENT_ANALYTICS_ENABLED === "true" &&
    (process.env.ENGAGEMENT_ANALYTICS_SECRET?.length ?? 0) >= 32
  );
}
export function signConsent(choice: "accepted" | "rejected", now = Date.now()) {
  const data = `${consentVersion}.${choice}.${Math.floor(now / 1000) + 180 * 86400}`;
  return `${data}.${createHmac(
    "sha256",
    process.env.ENGAGEMENT_ANALYTICS_SECRET ?? "",
  )
    .update(data)
    .digest("hex")}`;
}
export function readConsent(
  token: string | undefined,
  now = Date.now(),
): "accepted" | "rejected" | null {
  if (!token || !process.env.ENGAGEMENT_ANALYTICS_SECRET) return null;
  const [version, choice, expiry, signature, ...extra] = token.split(".");
  if (
    extra.length ||
    version !== consentVersion ||
    !["accepted", "rejected"].includes(choice) ||
    !/^\d{10}$/.test(expiry ?? "") ||
    Number(expiry) < now / 1000 ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  )
    return null;
  const expected = createHmac("sha256", process.env.ENGAGEMENT_ANALYTICS_SECRET)
    .update(`${version}.${choice}.${expiry}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
    ? (choice as "accepted" | "rejected")
    : null;
}
