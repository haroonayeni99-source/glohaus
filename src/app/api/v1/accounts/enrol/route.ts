import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { enrolAccount, ensureCustomerAccount } from "@/modules/accounts/repository";
import { AccessError, authorize, enrolmentSchema, workspacePath } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { accountDatabaseUnavailable, supabaseAccount, supabaseEnrolAccount } from "@/lib/account-supabase-fallback";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await getIdentity();
    const parsed = enrolmentSchema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    let account;
    try {
      account = await withIdentity(identity.authId, (db) =>
        enrolAccount(db, identity, parsed.data.role),
      );
    } catch (error) {
      if (!accountDatabaseUnavailable(error)) throw error;
      account = await supabaseEnrolAccount(parsed.data.role, {
        adultConfirmed: parsed.data.adultConfirmed,
        professionalTermsAccepted: parsed.data.professionalTermsAccepted,
      });
    }
    authorize(account, identity);
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
    let account;
    try {
      account = await withIdentity(identity.authId, (db) =>
        ensureCustomerAccount(db, identity),
      );
    } catch (error) {
      if (!accountDatabaseUnavailable(error)) throw error;
      account = (await supabaseAccount()) ?? (await supabaseEnrolAccount("customer"));
    }
    authorize(account, identity);
    return json({ redirectTo: workspacePath(account) });
  } catch (error) {
    return apiError(error);
  }
}
