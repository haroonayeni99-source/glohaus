import Link from "next/link";
import { redirect } from "next/navigation";
import { productionAuthUrl } from "@/lib/preview-auth";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";

export const metadata = { title: "Beauty professional sign in" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; authError?: string }>;
}) {
  const { returnTo, authError } = await searchParams;

  const previewTarget = productionAuthUrl(
    "/professional/sign-in",
    new URLSearchParams(
      Object.entries({ returnTo, authError }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  if (previewTarget) redirect(previewTarget);

  return (
    <AuthFrame audience="professional">
      {authConfigured() ? (
        <>
          <nav className="auth-switch" aria-label="Beauty professional sign in">
            <strong>Beauty Professional sign in</strong>{" "}
            <Link href="/sign-in">Customer? Use customer sign in</Link>
          </nav>
          <EmailAuthForm
            mode="sign-in"
            redirectTo={safeReturnTo(returnTo, "/professional")}
            audience="professional"
          />
          {authError && (
            <p className="form-error" role="alert">
              We couldn’t complete that email confirmation. Please sign in with your email and password.
            </p>
          )}
        </>
      ) : (
        <>
          <AccessMessage />
          <p className="auth-switch">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
