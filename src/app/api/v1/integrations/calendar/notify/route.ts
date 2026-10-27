import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { smallJson } from "@/lib/http";
import { withIdentity } from "@/lib/db";
import { unseal } from "@/modules/business-tools/secrets";
import { syncProfessional } from "@/modules/business-tools/repository";
import type { Tokens } from "@/modules/business-tools/oauth";
import type { WatchRoute } from "@/modules/business-tools/watch";
function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function POST(request: Request) {
  const url = new URL(request.url);
  // Microsoft verifies notification endpoints before issuing a subscription.
  const validation = url.searchParams.get("validationToken");
  if (validation && validation.length <= 2048)
    return new Response(validation, {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  try {
    const route = unseal<WatchRoute>(
      url.searchParams.get("route") || "",
      "calendar-notification",
    );
    if (route.expiresAt < Date.now())
      return new Response(null, { status: 401 });
    const row = await withIdentity(
      route.authId,
      async (db) =>
        (
          await db.query<{ secret_ciphertext: string }>(
            "SELECT secret_ciphertext FROM beauty.business_connections WHERE id=$1 AND professional_id=$2 AND provider=$3 AND status<>'disconnected'",
            [route.connectionId, route.professionalId, route.provider],
          )
        ).rows[0],
    );
    if (!row) return new Response(null, { status: 404 });
    const tokens = unseal<Tokens>(
      row.secret_ciphertext,
      `${route.professionalId}:${route.provider}`,
    );
    let valid = false;
    if (route.provider === "google")
      valid = Boolean(
        tokens.watch &&
        same(
          request.headers.get("X-Goog-Channel-Token") || "",
          tokens.watch.nonce,
        ) &&
        same(request.headers.get("X-Goog-Channel-Id") || "", tokens.watch.id) &&
        request.headers.get("X-Goog-Resource-Id") === tokens.watch.resourceId,
      );
    if (route.provider === "outlook") {
      const body = (await smallJson(request, 16384)) as {
        value?: { subscriptionId?: string; clientState?: string }[];
      };
      valid = Boolean(
        tokens.watch &&
        Array.isArray(body.value) &&
        body.value.some(
          (item) =>
            item.subscriptionId === tokens.watch!.id &&
            same(item.clientState || "", tokens.watch!.nonce),
        ),
      );
    }
    if (!valid || !same(route.nonce, tokens.watch?.nonce || ""))
      return new Response(null, { status: 401 });
    const accepted = await withIdentity(
      route.authId,
      async (db) =>
        (
          await db.query(
            "UPDATE beauty.business_connections SET next_sync_at=now() WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) AND (last_success_at IS NULL OR last_success_at<now()-interval '10 seconds') RETURNING id",
            [route.connectionId],
          )
        ).rows.length > 0,
    );
    if (accepted)
      after(async () => {
        try {
          await syncProfessional(
            route.authId,
            route.professionalId,
            route.connectionId,
          );
        } catch {
          console.warn("Calendar notification awaiting scheduled retry");
        }
      });
    return new Response(null, { status: 202 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
