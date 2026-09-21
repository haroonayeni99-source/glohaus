import { z } from "zod";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { withAdmin } from "@/modules/admin/repository";
const schema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("user"),
      id: z.uuid(),
      status: z.enum(["active", "suspended", "removed"]),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      id: z.uuid(),
      status: z.enum(["visible", "hidden"]),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("post"),
      id: z.uuid(),
      status: z.enum(["visible", "hidden"]),
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
    await withAdmin((db) =>
      db.query(
        input.type === "user"
          ? "SELECT beauty.admin_set_user_status($1,$2,$3)"
          : input.type === "review"
            ? "SELECT beauty.admin_moderate_review($1,$2,$3)"
            : "SELECT beauty.admin_moderate_post($1,$2,$3)",
        [input.id, input.status, input.reason],
      ),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
