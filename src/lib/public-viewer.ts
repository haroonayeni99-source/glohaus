import "server-only";

import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";

export async function publicViewerSignedIn(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  let authId = "";
  try {
    authId = (await getIdentity()).authId;
  } catch {
    return false;
  }

  try {
    return await withIdentity(authId, async (db) => {
      const account = await findAccount(db, authId);
      return account?.status === "active";
    });
  } catch {
    console.error("Public viewer state unavailable");
    return false;
  }
}
