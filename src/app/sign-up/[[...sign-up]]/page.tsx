import { SignUp } from "@clerk/nextjs";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
export const metadata = { title: "Create your account" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; returnTo?: string }>;
}) {
  const { intent, returnTo } = await searchParams;
  const safeTarget = safeReturnTo(returnTo, "");
  const target =
    intent === "professional"
      ? "/onboarding?intent=professional"
      : `/onboarding${safeTarget ? `?returnTo=${encodeURIComponent(safeTarget)}` : ""}`;
  return (
    <AuthFrame>
      {authConfigured() ? (
        <SignUp routing="path" path="/sign-up" forceRedirectUrl={target} />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
