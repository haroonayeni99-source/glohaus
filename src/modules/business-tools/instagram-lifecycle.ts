import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withPaymentWorker } from "@/modules/payments/worker";

type SignedRequest = { userId: string; issuedAt: number; receipt: string };
class CallbackError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const invalid = () => new CallbackError("INVALID_SIGNED_REQUEST", 400);

function decode(part: string) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(part)) throw invalid();
  const bytes = Buffer.from(part, "base64url");
  if (bytes.toString("base64url") !== part.replace(/=+$/, "")) throw invalid();
  return bytes;
}

export function instagramSubject(appId: string, userId: string) {
  const key = process.env.BUSINESS_TOOLS_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new CallbackError("NOT_CONFIGURED", 503);
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(`instagram-subject-v1:${appId}:${userId}`).digest("hex");
}

export function verifyInstagramRequest(value: string): SignedRequest {
  if (value.length > 12000) throw invalid();
  const [signature, payload, ...extra] = value.split(".");
  if (!signature || !payload || extra.length) throw invalid();
  const actual = decode(signature);
  const decoded = decode(payload);
  if (actual.length !== 32) throw invalid();
  const secret = process.env.INSTAGRAM_CLIENT_SECRET;
  if (!secret) throw new CallbackError("NOT_CONFIGURED", 503);
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!timingSafeEqual(actual, expected)) throw invalid();
  let data;
  try { data = JSON.parse(decoded.toString("utf8")); } catch { throw invalid(); }
  if (!data || typeof data !== "object" || Array.isArray(data)
    || typeof data.algorithm !== "string" || data.algorithm.toUpperCase() !== "HMAC-SHA256"
    || typeof data.user_id !== "string" || !/^\d{1,128}$/.test(data.user_id)
    || !Number.isSafeInteger(data.issued_at) || data.issued_at <= 0
    || data.issued_at > Math.floor(Date.now() / 1000) + 300) throw invalid();
  return { userId: data.user_id, issuedAt: data.issued_at,
    receipt: createHmac("sha256", secret).update(`instagram-receipt-v1:${value}`).digest("hex") };
}

async function signedForm(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded")
    throw new CallbackError("INVALID_REQUEST", 415);
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); throw new CallbackError("INVALID_REQUEST", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const values = form.getAll("signed_request");
  if (values.length !== 1) throw invalid();
  return verifyInstagramRequest(values[0]);
}

export const instagramCallbackHeaders = {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function receiptOrigin() {
  const preview = process.env.VERCEL_URL || "";
  return process.env.VERCEL_ENV === "preview" && /^[a-z0-9-]+\.vercel\.app$/i.test(preview)
    ? `https://${preview}` : "https://www.glohaus.shop";
}

export async function instagramLifecycle(request: Request, operation: "deauthorize" | "delete") {
  try {
    const verified = await signedForm(request);
    const appId = process.env.INSTAGRAM_CLIENT_ID || "";
    if (!/^\d{1,128}$/.test(appId)) throw new CallbackError("NOT_CONFIGURED", 503);
    const subject = instagramSubject(appId, verified.userId);
    // This transaction must commit before acknowledging Meta or reporting completion.
    await withPaymentWorker(db => db.query(
      "SELECT beauty.instagram_lifecycle_callback($1,$2,$3,$4)",
      [subject, verified.issuedAt, operation, verified.receipt],
    ));
    if (operation === "deauthorize") return Response.json({ success: true }, { headers: instagramCallbackHeaders });
    return Response.json({ confirmation_code: verified.receipt,
      url: `${receiptOrigin()}/api/webhooks/instagram/data-deletion/status?code=${verified.receipt}` },
    { headers: instagramCallbackHeaders });
  } catch (error) {
    const status = error instanceof CallbackError ? error.status : 503;
    const code = error instanceof CallbackError ? error.code : "UNAVAILABLE";
    // No provider payloads, identifiers, credentials or database messages in logs.
    return Response.json({ error: { code } }, { status, headers: instagramCallbackHeaders });
  }
}
