import "server-only";
import { getIdentity } from "./identity";
import { withIdentity } from "./db";
import { authorize, type Account, type Role } from "@/modules/accounts/domain";
import { findAccount, type SqlClient } from "@/modules/accounts/repository";
export async function withAccount<T>(
  role: Role,
  work: (db: SqlClient, account: Account) => Promise<T>,
) {
  const identity = await getIdentity();
  return withIdentity(identity.authId, async (db) => {
    const account = authorize(
      await findAccount(db, identity.authId),
      identity,
      role,
    );
    return work(db, account);
  });
}
