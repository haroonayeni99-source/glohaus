import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { enrolAccount, findAccount } from "@/modules/accounts/repository";
import { AccessError, enrolmentSchema, workspacePath } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getIdentity();
    const parsed = enrolmentSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const account = await withIdentity(identity.authId, (db) =>
      enrolAccount(db, identity, parsed.data.role),
    );
    return json({ redirectTo: workspacePath(account) });
  } catch (error) {
    return apiError(error);
  }
}

// After Supabase authenticates a person, this endpoint safely completes the
// basic GLOHAUS customer account if they do not have an application account yet.
// Existing accounts and professional/admin roles are never replaced.
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getIdentity();
    const account = await withIdentity(identity.authId, async (db) => {
      const existing = await findAccount(db, identity.authId);
      if (existing) return existing;
      return enrolAccount(db, identity, "customer");
    });
    return json({ redirectTo: workspacePath(account) });
  } catch (error) {
    return apiError(error);
  }
}
