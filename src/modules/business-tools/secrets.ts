import "server-only";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
function key() {
  const text = process.env.BUSINESS_TOOLS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(text)) throw Error("NOT_CONFIGURED");
  return Buffer.from(text, "hex");
}
export function encryptionReady() {
  return /^[a-f0-9]{64}$/i.test(
    process.env.BUSINESS_TOOLS_ENCRYPTION_KEY || "",
  );
}
export function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string, purpose: string): T {
  const [version, iv, tag, body, ...extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra.length)
    throw Error("INVALID_SECRET");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
