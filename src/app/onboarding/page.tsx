import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { EnrolmentForm } from "@/components/enrolment-form";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { AccessError, workspacePath } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { safeReturnTo } from "@/lib/return-to";
export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your workspace" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const { intent, returnTo } = await searchParams;
  let code: AccessError["code"] | null = null;
  try {
    const identity = await getIdentity();
    const account = await withIdentity(identity.authId, (db) =>
      findAccount(db, identity.authId),
    );
    if (account && account.status !== "active") code = "ACCOUNT_INACTIVE";
    if (account?.status === "active") {
      const needsProfessionalSetup =
        intent === "professional" &&
        !account.roles.includes("professional");
      if (!needsProfessionalSetup) redirect(workspacePath(account));
    }
  } catch (error) {
    if (error instanceof AccessError && error.code === "UNAUTHENTICATED")
      redirect("/sign-in");
    code = error instanceof AccessError ? error.code : "UNAVAILABLE";
  }
  return (
    <AuthFrame audience={intent === "professional" ? "professional" : "customer"}>
      {code ? (
        <AccessMessage code={code} />
      ) : (
        <EnrolmentForm
          initialRole={intent === "professional" ? "professional" : "customer"}
          returnTo={safeReturnTo(returnTo, "")}
        />
      )}
    </AuthFrame>
  );
}
