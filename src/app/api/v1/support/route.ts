import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { createHash, randomBytes, createHmac } from "node:crypto";
import { withIdentity } from "@/lib/db";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { supportInputSchema } from "@/modules/support/domain";
import { createSupportRequest } from "@/modules/support/repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = supportInputSchema.safeParse(
      await smallJson(request, 24_000),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    if (parsed.data.website) throw new AccessError("INVALID_REQUEST", 400);
    // Vercel overwrites this header. Never accept a client-selected rate key.
    const ip = request.headers.get("x-vercel-forwarded-for") || "unknown";
    const rateKey = createHmac(
      "sha256",
      process.env.CRON_SECRET || process.env.DATABASE_URL || "local-support",
    )
      .update(ip)
      .digest("hex");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const id = await withIdentity("", (db) =>
      createSupportRequest(db, parsed.data, rateKey, tokenHash),
    );
    scheduleNotificationDelivery();
    return json({ id, token }, 201);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      error.message === "SUPPORT_RATE_LIMIT"
    )
      return json({ error: { code: "RATE_LIMITED" } }, 429);
    return apiError(error, {
      operation: "support.create",
      code: "SUPPORT_REQUEST_FAILED",
    });
  }
}
