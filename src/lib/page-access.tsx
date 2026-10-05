import "server-only";
import { redirect } from "next/navigation";
import { getIdentity } from "./identity";
import { withIdentity } from "./db";
import {
  accountDatabaseUnavailable,
  supabaseAccount,
} from "./account-supabase-fallback";
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
    try {
      const account = await withIdentity(identity.authId, async (db) =>
        authorize(await findAccount(db, identity.authId), identity, role),
      );

      return { account, error: null };
    } catch (error) {
      if (!accountDatabaseUnavailable(error)) throw error;

      const account = authorize(await supabaseAccount(), identity, role);

      return { account, error: null };
    }
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === "UNAUTHENTICATED")
        redirect(role === "professional" ? "/professional/sign-in" : "/sign-in");
      if (error.code === "ONBOARDING_REQUIRED")
        redirect(
          role === "professional"
            ? "/onboarding?intent=professional"
            : role === "customer"
              ? "/onboarding?intent=customer"
              : "/onboarding",
        );
      return { account: null, error: error.code };
    }
    console.error("Workspace unavailable", {
      type: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "",
    });
    return { account: null, error: "UNAVAILABLE" };
  }
}
