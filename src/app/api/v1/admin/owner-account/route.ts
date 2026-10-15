import { z } from "zod";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { withOwner } from "@/modules/admin/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("restrict"),
      userId: z.uuid(),
      restrictedUntil: z.iso.datetime(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("liftRestriction"),
      userId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      userId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
      confirmation: z.literal("DELETE"),
    })
    .strict(),
  z
    .object({
      action: z.enum(["hide", "show"]),
      userId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;

    if (input.action === "restrict") {
      await withOwner((db) =>
        db.query("SELECT beauty.owner_set_user_restriction($1,$2,$3)", [
          input.userId,
          input.restrictedUntil,
          input.reason,
        ]),
      );
      return json({ saved: true });
    }

    if (input.action === "liftRestriction") {
      await withOwner((db) =>
        db.query("SELECT beauty.owner_set_user_restriction($1,NULL,$2)", [
          input.userId,
          input.reason,
        ]),
      );
      return json({ saved: true });
    }

    if (input.action === "hide" || input.action === "show") {
      await withOwner((db) =>
        db.query("SELECT beauty.owner_set_account_visibility($1,$2,$3)", [
          input.userId,
          input.action === "hide",
          input.reason,
        ]),
      );
      return json({
        saved: true,
        message:
          input.action === "hide"
            ? "Account and public content hidden. Existing bookings and payments are unchanged."
            : "Account visibility restored. Draft and moderated content stays unpublished.",
      });
    }

    // Revoke platform access and public content before contacting the provider.
    // A missing credential or provider outage must not leave a deleted account live.
    const result = await withOwner(
      async (db) =>
        (
          await db.query<{
            data: { authId: string; authCleanupPending: boolean };
          }>("SELECT beauty.owner_remove_account($1,$2) AS data", [
            input.userId,
            input.reason,
          ])
        ).rows[0]?.data,
    );
    if (!result?.authId) throw new AccessError("UNAVAILABLE", 503);
    let authCleanupPending = result.authCleanupPending;
    const admin = authCleanupPending ? createSupabaseAdminClient() : null;
    if (admin) {
      try {
        const { error } = await admin.auth.admin.deleteUser(result.authId);
        if (!error || error.status === 404) {
          await withOwner((db) =>
            db.query("SELECT beauty.owner_finish_auth_cleanup($1)", [
              input.userId,
            ]),
          );
          authCleanupPending = false;
        }
      } catch {
        // Durable pending state allows an Owner to finish cleanup later.
      }
    }
    return json({
      saved: true,
      deleted: true,
      authCleanupPending,
      message: authCleanupPending
        ? "Account deleted from GLOHAUS and public content hidden. Sign-in record cleanup is pending; access is already blocked."
        : "Account and sign-in credentials deleted. Booking, payment and audit history is retained.",
    });
  } catch (error) {
    return apiError(error);
  }
}
