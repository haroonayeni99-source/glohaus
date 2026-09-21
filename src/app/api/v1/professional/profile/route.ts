import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { profileSchema } from "@/modules/professionals/domain";
import { updateProfile } from "@/modules/professionals/repository";
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = profileSchema.safeParse(await smallJson(request, 32768));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      updateProfile(db, account.professionalId!, parsed.data),
    );
    return json({ saved: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      return json({ error: { code: "SLUG_UNAVAILABLE" } }, 409);
    return apiError(error);
  }
}
