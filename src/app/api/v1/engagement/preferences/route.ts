import { cookies } from "next/headers";
import {
  consentCookie,
  engagementEnabled,
  readConsent,
  signConsent,
} from "@/modules/website-analytics/config";
import { assertSameOrigin, json, smallJson, apiError } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { withIdentity } from "@/lib/db";
async function ready() {
  if (!engagementEnabled()) return false;
  return withIdentity(
    "",
    async (db) =>
      (
        await db.query<{ ready: boolean }>(
          "SELECT beauty.engagement_ready() AS ready",
        )
      ).rows[0]?.ready === true,
  ).catch(() => false);
}
export async function GET() {
  return json({
    enabled: await ready(),
    choice: readConsent((await cookies()).get(consentCookie)?.value),
  });
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await smallJson(request, 100);
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).length !== 1 ||
      !("choice" in body) ||
      !["accepted", "rejected"].includes(String(body.choice))
    )
      throw new AccessError("INVALID_REQUEST", 400);
    if (!engagementEnabled()) return json({ enabled: false }, 503);
    (await cookies()).set(
      consentCookie,
      signConsent(body.choice as "accepted" | "rejected"),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 180 * 86400,
      },
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
