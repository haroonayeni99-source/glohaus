import Link from "next/link";
import { redirect } from "next/navigation";
import { productionAuthUrl } from "@/lib/preview-auth";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";

export const metadata = { title: "Customer sign in" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; intent?: string; authError?: string }>;
}) {
  const { returnTo, intent, authError } = await searchParams;

  if (intent === "professional") {
    const params = new URLSearchParams();
    if (returnTo) params.set("returnTo", returnTo);
    if (authError) params.set("authError", authError);
    const query = params.toString();
    redirect(`/professional/sign-in${query ? `?${query}` : ""}`);
  }

  const previewTarget = productionAuthUrl(
    "/sign-in",
    new URLSearchParams(
      Object.entries({ returnTo, authError }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  if (previewTarget) redirect(previewTarget);

  return (
    <AuthFrame audience="customer">
      {authConfigured() ? (
        <>
          <nav className="auth-switch" aria-label="Customer sign in">
            <strong>Customer sign in</strong>{" "}
            <Link href="/professional/sign-in">Beauty professional? Sign in to GLOHAUS PRO</Link>
          </nav>
          <EmailAuthForm
            mode="sign-in"
            redirectTo={safeReturnTo(returnTo, "/account")}
            audience="customer"
          />
          <p className="auth-switch">
            Owner/Admin accounts are detected automatically and open the Owner/Admin control centre.
          </p>
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
