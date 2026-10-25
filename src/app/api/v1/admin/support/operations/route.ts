import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { supportOperationsInput } from "@/modules/support/operations";

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("caseId");
    if (id && !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const data = await withOwner(
      async (db) =>
        (
          await db.query("SELECT beauty.owner_support_operations($1) AS data", [
            id || null,
          ])
        ).rows[0].data,
    );
    return json(data);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      error.code === "22023" &&
      ["HOLD_REVIEW_REQUIRED", "INVALID_RECEIVED_DATE"].includes(
        String(error.message),
      )
    ) {
      return apiError(new AccessError("INVALID_REQUEST", 400));
    }
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = supportOperationsInput.safeParse(
      await smallJson(request, 4096),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      db.query("SELECT beauty.owner_update_support_operations($1,$2::jsonb)", [
        parsed.data.id,
        JSON.stringify(parsed.data),
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      error.code === "22023" &&
      ["HOLD_REVIEW_REQUIRED", "INVALID_RECEIVED_DATE"].includes(
        String(error.message),
      )
    ) {
      return apiError(new AccessError("INVALID_REQUEST", 400));
    }
    return apiError(error);
  }
}
