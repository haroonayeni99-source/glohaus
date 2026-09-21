import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";
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
    <AuthFrame audience={intent === "professional" ? "professional" : "customer"}>
      {authConfigured() ? (
        <EmailAuthForm
          mode="sign-up"
          redirectTo={target}
          audience={intent === "professional" ? "professional" : "customer"}
        />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
