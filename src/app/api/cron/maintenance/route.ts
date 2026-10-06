import { timingSafeEqual } from "node:crypto";
import { withPaymentWorker } from "@/modules/payments/worker";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  return Boolean(
    secret &&
      actual.length === expected.length &&
      timingSafeEqual(actual, expected),
  );
}

export async function GET(request: Request) {
  if (!authorized(request))
    return new Response("Unauthorized", { status: 401 });

  try {
    const result = await withPaymentWorker(async (db) => {
      const row = await db.query<{ result: Record<string, number> }>(
        "SELECT beauty.run_scheduled_maintenance() AS result",
      );
      return row.rows[0]?.result ?? {};
    });

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    console.error("Scheduled maintenance worker failed");
    return new Response("Retry later", { status: 503 });
  }
}
