import { withPaymentWorker } from "@/modules/payments/worker";
import { instagramCallbackHeaders } from "@/modules/business-tools/instagram-lifecycle";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!/^[a-f0-9]{64}$/.test(code)) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: instagramCallbackHeaders });
  try {
    const result = await withPaymentWorker(async db => (await db.query<{ completed: boolean }>(
      "SELECT beauty.instagram_deletion_completed($1) AS completed", [code],
    )).rows[0]?.completed);
    return Response.json(result ? { status: "completed", confirmation_code: code } : { error: { code: "NOT_FOUND" } },
      { status: result ? 200 : 404, headers: instagramCallbackHeaders });
  } catch {
    return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503, headers: instagramCallbackHeaders });
  }
}
