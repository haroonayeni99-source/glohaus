import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { originSchema, type JourneyOrigin } from "./domain";
import { googleRoutesApiKey } from "./config";

function key() {
  const raw = process.env.JOURNEY_ROUTING_ENCRYPTION_KEY || "";
  if (!/^[a-f\d]{64}$/i.test(raw)) throw new Error("ROUTING_NOT_CONFIGURED");
  return Buffer.from(raw, "hex");
}
export function routingConfigured() {
  return (
    Boolean(googleRoutesApiKey()) &&
    /^[a-f\d]{64}$/i.test(process.env.JOURNEY_ROUTING_ENCRYPTION_KEY || "")
  );
}
export function encryptOrigin(origin: JourneyOrigin, bookingId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`glohaus-journey-v1:${bookingId}`));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(origin), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}
export function decryptOrigin(value: string, bookingId: string): JourneyOrigin {
  const [version, iv, tag, body, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra || value.length > 2500)
    throw new Error("INVALID_ENCRYPTED_ORIGIN");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`glohaus-journey-v1:${bookingId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return originSchema.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ),
  );
}
