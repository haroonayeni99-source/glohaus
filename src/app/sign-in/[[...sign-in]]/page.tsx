import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; intent?: string }>;
}) {
  const { returnTo, intent } = await searchParams;
  const audience = intent === "professional" ? "professional" : "customer";
  return (
    <AuthFrame audience={audience}>
      {authConfigured() ? (
        <EmailAuthForm mode="sign-in" redirectTo={safeReturnTo(returnTo)} audience={audience} />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
