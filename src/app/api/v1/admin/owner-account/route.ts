import { z } from "zod";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { withOwner } from "@/modules/admin/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("restrict"),
    userId: z.uuid(),
    restrictedUntil: z.iso.datetime(),
    reason: z.string().trim().min(5).max(500),
  }).strict(),
  z.object({
    action: z.literal("liftRestriction"),
    userId: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  }).strict(),
  z.object({
    action: z.literal("delete"),
    userId: z.uuid(),
    reason: z.string().trim().min(5).max(500),
  }).strict(),
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

    const admin = createSupabaseAdminClient();
    if (!admin) {
      throw new Error(
        "Account deletion is not configured. Add a server-only Supabase secret key before using hard delete.",
      );
    }

    const authId = await withOwner(async (db) => {
      const row = (
        await db.query<{ auth_id: string }>(
          `SELECT u.auth_id
           FROM beauty.users u
           WHERE u.id=$1
             AND u.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM beauty.user_roles r
               WHERE r.user_id=u.id AND r.role='owner'
             )`,
          [input.userId],
        )
      ).rows[0];
      if (!row?.auth_id) throw new AccessError("FORBIDDEN", 403);
      return row.auth_id;
    });

    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error) throw new Error("Supabase Auth account deletion failed.");

    await withOwner((db) =>
      db.query("SELECT beauty.owner_mark_user_deleted($1,$2)", [
        input.userId,
        input.reason,
      ]),
    );

    return json({ saved: true, deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
