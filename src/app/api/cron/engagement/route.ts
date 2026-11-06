import { timingSafeEqual } from "node:crypto";
import { engagementEnabled } from "@/modules/website-analytics/config";
import { withPaymentWorker } from "@/modules/payments/worker";
export const maxDuration = 30;
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!engagementEnabled())
    return Response.json(
      { enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const removed = await withPaymentWorker(
      async (db) =>
        (
          await db.query<{ removed: number }>(
            "SELECT beauty.run_engagement_retention() AS removed",
          )
        ).rows[0]?.removed ?? 0,
    );
    return Response.json(
      { removed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Retention unavailable" }, { status: 503 });
  }
}
