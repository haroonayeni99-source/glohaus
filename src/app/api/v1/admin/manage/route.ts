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
  z
    .object({
      type: z.literal("professionalTrust"),
      id: z.uuid(),
      verification: z.enum(["unverified", "pending", "verified", "rejected"]),
      standing: z.enum(["good", "restricted"]),
      restrictedUntil: z.iso.datetime().nullable(),
      badges: z
        .object({
          identity: z.boolean(),
          business: z.boolean(),
          professional: z.boolean(),
        })
        .strict()
        .optional(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("report"),
      id: z.uuid(),
      status: z.enum(["under_review", "resolved", "dismissed"]),
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
    if (
      input.type === "professionalTrust" &&
      input.badges &&
      (input.verification === "verified" ||
        input.badges.business ||
        input.badges.professional) &&
      !input.badges.identity
    )
      throw new AccessError("INVALID_REQUEST", 400);
    await withAdmin((db) =>
      db.query(
        input.type === "user"
          ? "SELECT beauty.admin_set_user_status($1,$2,$3)"
          : input.type === "review"
            ? "SELECT beauty.admin_moderate_review($1,$2,$3)"
            : input.type === "report"
              ? "SELECT beauty.admin_resolve_safety_report($1,$2,$3)"
              : input.type === "professionalTrust"
                ? input.badges
                  ? "SELECT beauty.admin_set_professional_trust($1,$2,$3,$4,$5,$6,$7,$8)"
                  : "SELECT beauty.admin_set_professional_trust($1,$2,$3,$4,$5)"
                : "SELECT beauty.admin_moderate_post($1,$2,$3)",
        input.type === "professionalTrust"
          ? input.badges
            ? [
                input.id,
                input.verification,
                input.standing,
                input.restrictedUntil,
                input.badges.identity,
                input.badges.business,
                input.badges.professional,
                input.reason,
              ]
            : [
                input.id,
                input.verification,
                input.standing,
                input.restrictedUntil,
                input.reason,
              ]
          : [input.id, input.status, input.reason],
      ),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
