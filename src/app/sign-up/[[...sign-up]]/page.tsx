import Link from "next/link";
import { redirect } from "next/navigation";
import { productionAuthUrl } from "@/lib/preview-auth";
import { BriefcaseBusiness, ChevronRight, UserRound } from "lucide-react";
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
  const previewTarget = productionAuthUrl(
    "/sign-up",
    new URLSearchParams(
      Object.entries({ intent, returnTo }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  if (previewTarget) redirect(previewTarget);
  const selectedIntent =
    intent === "customer" || intent === "professional" ? intent : null;

  if (!selectedIntent) {
    const customerHref = returnTo
      ? `/sign-up?intent=customer&returnTo=${encodeURIComponent(returnTo)}`
      : "/sign-up?intent=customer";

    return (
      <AuthFrame>
        <section className="enrolment-form" aria-labelledby="signup-role-title">
          <p className="eyebrow">CREATE YOUR GLOHAUS ACCOUNT</p>
          <h1 id="signup-role-title">How will you use GLOHAUS?</h1>
          <p>
            Choose the account experience you want to set up. You can use the
            same email address if your account later has access to both views.
          </p>

          <div className="role-links" aria-label="Choose account type">
            <Link className="role-option" href={customerHref}>
              <UserRound size={23} aria-hidden />
              <span>
                <strong>Sign up as a Customer</strong>
                <small>
                  Discover professionals, book services, message, shop, save
                  looks and manage your appointments.
                </small>
              </span>
              <ChevronRight size={19} aria-hidden />
            </Link>

            <Link
              className="role-option"
              href="/sign-up?intent=professional"
            >
              <BriefcaseBusiness size={23} aria-hidden />
              <span>
                <strong>Sign up as a Professional</strong>
                <small>
                  Build your business profile, services, availability, bookings,
                  clients, products, messages and earnings.
                </small>
              </span>
              <ChevronRight size={19} aria-hidden />
            </Link>
          </div>

          <p className="auth-switch">
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </p>
        </section>
      </AuthFrame>
    );
  }

  const safeTarget = safeReturnTo(returnTo, "");
  const professional = selectedIntent === "professional";
  const target = professional
    ? "/onboarding?intent=professional"
    : safeTarget || "/account";

  return (
    <AuthFrame audience={professional ? "professional" : "customer"}>
      {authConfigured() ? (
        <EmailAuthForm
          mode="sign-up"
          redirectTo={target}
          audience={professional ? "professional" : "customer"}
        />
      ) : (
        <AccessMessage />
      )}
    </AuthFrame>
  );
}
