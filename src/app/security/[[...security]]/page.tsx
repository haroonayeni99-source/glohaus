import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { AccessError } from "@/modules/accounts/domain";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
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
  // Identity-only access intentionally permits MFA setup before app enrollment.
  return (
    <main id="main" className="security-page">
      <Link className="back-link" href="/workspace">
        ← My workspace
      </Link>
      <h1>Account & security</h1>
      <UserProfile routing="path" path="/security" />
      <Link className="text-link" href="/onboarding">
        Add another workspace →
      </Link>
    </main>
  );
}
