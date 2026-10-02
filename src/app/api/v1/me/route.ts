import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { findAccount } from "@/modules/accounts/repository";
import { authorize } from "@/modules/accounts/domain";
import { apiError, json } from "@/lib/http";
import { accountDatabaseUnavailable, supabaseAccount } from "@/lib/account-supabase-fallback";
export async function GET() {
  try {
    const identity = await getIdentity();
    let account;
    try {
      account = await withIdentity(identity.authId, async (db) =>
        authorize(await findAccount(db, identity.authId), identity),
      );
    } catch (error) {
      if (!accountDatabaseUnavailable(error)) throw error;
      account = authorize(await supabaseAccount(), identity);
    }
    return json({
      account: {
        id: account.id,
        displayName: account.displayName,
        roles: account.roles,
        professionalId: account.professionalId,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
