import Link from "next/link";
import { redirect } from "next/navigation";
import { productionAuthUrl } from "@/lib/preview-auth";
import { authConfigured } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { safeReturnTo } from "@/lib/return-to";
import { EmailAuthForm } from "@/components/email-auth-form";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; intent?: string; authError?: string }>;
}) {
  const { returnTo, intent, authError } = await searchParams;
  const previewTarget = productionAuthUrl(
    "/sign-in",
    new URLSearchParams(
      Object.entries({ returnTo, intent, authError }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  if (previewTarget) redirect(previewTarget);
  const audience = intent === "professional" ? "professional" : "customer";
  const defaultTarget = audience === "professional" ? "/professional" : "/account";
  return (
    <AuthFrame audience={audience}>
      {authConfigured() ? (
        <>
          <nav className="auth-switch" aria-label="Choose sign in type">
            {audience === "professional" ? (
              <>
                <strong>Signing in as GLOHAUS PRO</strong>{" "}
                <Link href="/sign-in">Switch to customer sign in</Link>
              </>
            ) : (
              <>
                <strong>Signing in as customer</strong>{" "}
                <Link href="/sign-in?intent=professional&returnTo=/professional">
                  Switch to GLOHAUS PRO sign in
                </Link>
              </>
            )}
          </nav>
          <EmailAuthForm mode="sign-in" redirectTo={safeReturnTo(returnTo, defaultTarget)} audience={audience} />
          <p className="auth-switch">
            Owner/Admin accounts are detected automatically and open the Owner/Admin control centre.
          </p>
          {authError && <p className="form-error" role="alert">We couldn’t complete that email confirmation. Please sign in with your email and password.</p>}
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
