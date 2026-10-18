import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const payload = z.object({ id: z.uuid(), exp: z.number().int() }).strict();
function signature(body: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`glohaus-push-device-receipt-v1:${body}`)
    .digest("base64url");
}
export function pushReceiptToken(id: string, now = Date.now()) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !z.uuid().safeParse(id).success) return undefined;
  const body = Buffer.from(
    JSON.stringify({ id, exp: Math.floor(now / 1000) + 3600 }),
  ).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}
export function verifyPushReceiptToken(token: string, now = Date.now()) {
  const secret = process.env.CRON_SECRET;
  if (!secret || token.length > 500) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra) return null;
  const expected = Buffer.from(signature(body, secret)),
    actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const parsed = payload.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (
      !parsed.success ||
      parsed.data.exp <= now / 1000 ||
      parsed.data.exp > now / 1000 + 3601
    )
      return null;
    return parsed.data.id;
  } catch {
    return null;
  }
}
