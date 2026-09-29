import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { categoryIsActive } from "@/modules/platform/repository";
import { profileSchema } from "@/modules/professionals/domain";
import { updateProfile } from "@/modules/professionals/repository";
import { assertProfilePublishingAllowed, professionalAccessState } from "@/modules/professionals/verification";
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = profileSchema.safeParse(await smallJson(request, 32768));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, account) => {
      if (!(await categoryIsActive(db, parsed.data.category)))
        throw new AccessError("INVALID_REQUEST", 400);
      const access = await professionalAccessState(db, account.professionalId!);
      assertProfilePublishingAllowed(access, parsed.data.publicationStatus);
      return updateProfile(db, account.professionalId!, parsed.data);
    });
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
