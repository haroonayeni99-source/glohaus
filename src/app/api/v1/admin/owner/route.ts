import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const permissions = z.enum([
  "users.read","users.manage","professionals.read","professionals.manage",
  "bookings.read","reports.manage","content.moderate","reviews.moderate",
  "verification.manage","analytics.read","notifications.read",
]);
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("role"), userId: z.uuid(), role: z.enum(["staff","admin"]), enabled: z.boolean(), reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ type: z.literal("permissions"), userId: z.uuid(), permissions: z.array(permissions).max(11), reason: z.string().trim().min(5).max(500) }).strict(),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      parsed.data.type === "role"
        ? db.query("SELECT beauty.owner_set_privileged_role($1,$2,$3,$4)", [parsed.data.userId, parsed.data.role, parsed.data.enabled, parsed.data.reason])
        : db.query("SELECT beauty.owner_set_staff_permissions($1,$2,$3)", [parsed.data.userId, parsed.data.permissions, parsed.data.reason]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
