import { SignIn } from "@clerk/nextjs";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
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
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl={safeReturnTo(returnTo)}
        />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
