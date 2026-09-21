import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <AuthFrame>
      {authConfigured() ? (
        <EmailAuthForm mode="sign-in" redirectTo={safeReturnTo(returnTo)} />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
