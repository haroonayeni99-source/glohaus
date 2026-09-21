import "server-only";
import { redirect } from "next/navigation";
import { getIdentity } from "./identity";
import { withIdentity } from "./db";
import { findAccount } from "@/modules/accounts/repository";
import {
  AccessError,
  authorize,
  type Role,
  type Account,
} from "@/modules/accounts/domain";

export async function pageAccount(
  role?: Role,
): Promise<
  | { account: Account; error: null }
  | { account: null; error: AccessError["code"] }
> {
  try {
    const identity = await getIdentity();
    const account = await withIdentity(identity.authId, async (db) =>
      authorize(await findAccount(db, identity.authId), identity, role),
    );
    return { account, error: null };
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "UNAUTHENTICATED") redirect("/sign-in");
      if (error.code === "ONBOARDING_REQUIRED") redirect("/onboarding");
      return { account: null, error: error.code };
    }
    console.error("Workspace unavailable", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return { account: null, error: "UNAVAILABLE" };
  }
}
