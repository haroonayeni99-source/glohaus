import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { AccessError } from "@/modules/accounts/domain";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { MfaManager } from "@/components/mfa-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account security" };

export default async function Page() {
  try {
    await getIdentity();
  } catch (error) {
    if (error instanceof AccessError && error.code === "UNAUTHENTICATED")
      redirect("/sign-in");
    return (
      <AuthFrame>
        <AccessMessage
          code={error instanceof AccessError ? error.code : "UNAVAILABLE"}
        />
      </AuthFrame>
    );
  }

  return (
    <main id="main" className="security-page">
      <Link className="back-link" href="/workspace">
        ← My workspace
      </Link>
      <h1>Account & security</h1>
      <p>
        Manage the second factor required for sensitive GLOHAUS owner and admin access.
        Password changes are handled from the sign-in screen.
      </p>
      <MfaManager />
      <Link className="text-link" href="/onboarding">
        Add another workspace →
      </Link>
    </main>
  );
}
