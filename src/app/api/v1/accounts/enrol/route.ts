import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { enrolAccount } from "@/modules/accounts/repository";
import { AccessError, enrolmentSchema } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getIdentity();
    const parsed = enrolmentSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withIdentity(identity.authId, (db) =>
      enrolAccount(db, identity, parsed.data.role),
    );
    return json({
      redirectTo:
        parsed.data.role === "professional" ? "/professional" : "/account",
    });
  } catch (error) {
    return apiError(error);
  }
}
