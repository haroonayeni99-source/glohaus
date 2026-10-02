"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signedInDestination } from "@/lib/auth-flow";

export function EmailAuthForm({
  mode,
  redirectTo,
  audience = "customer",
}: {
  mode: "sign-in" | "sign-up";
  redirectTo: string;
  audience?: "customer" | "professional";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  async function provisionCustomer() {
    const provision = await fetch("/api/v1/accounts/enrol", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!provision.ok) {
      let code = "";
      try {
        const payload = await provision.json();
        code = payload?.error?.code || "";
      } catch {}
      setError(
        code === "FORBIDDEN"
          ? "You’re signed in, but GLOHAUS couldn’t verify this site for account setup. Please refresh and try again."
          : code === "UNAVAILABLE"
            ? "You’re signed in, but GLOHAUS account services are temporarily unavailable. Please try again."
            : "You’re signed in, but we couldn’t finish opening your GLOHAUS account. Please try again.",
      );
      setPending(false);
      return null;
    }
    return provision.json();
  }

  async function serverAccount() {
    return fetch("/api/v1/me", { cache: "no-store" });
  }

  function authCallbackUrl(next: string) {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const supabase = createClient();
    const result =
      mode === "sign-up"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: authCallbackUrl(redirectTo),
              data: { glohaus_audience: audience },
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
      setPending(false);
      return;
    }
    if (mode === "sign-up" && !result.data.session) {
      setConfirmationEmail(email);
      setError(null);
      setPending(false);
      return;
    }

    if (mode === "sign-up") {
      if (audience === "professional") {
        router.push("/onboarding?intent=professional");
        return;
      }
      const account = await provisionCustomer();
      if (!account) return;
      router.push(redirectTo || account.redirectTo || "/account");
      return;
    }

    // A Supabase user can predate the GLOHAUS application account. After a
    // successful password sign-in, bootstrap the internal account first so it
    // appears in Owner/Admin and role routing has a real application record.
    // This adds only the baseline customer role; professional access still
    // requires the 18+ and Professional Terms onboarding flow.
    const provisioned = await provisionCustomer();
    if (!provisioned) return;

    let verified = await serverAccount();
    if (!verified.ok && verified.status === 401) {
      await supabase.auth.getSession();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      verified = await serverAccount();
    }

    if (verified.ok) {
      const me = await verified.json();
      router.push(
        signedInDestination(me?.account?.roles, audience, redirectTo),
      );
      return;
    }

    const trustedRoles = Array.isArray(result.data.user?.app_metadata?.glohaus_roles)
      ? result.data.user.app_metadata.glohaus_roles.filter(
          (role: unknown): role is string => typeof role === "string",
        )
      : [];

    if (trustedRoles.includes("owner") || trustedRoles.includes("admin")) {
      router.push("/admin");
      return;
    }

    if (audience === "professional") {
      router.push("/onboarding?intent=professional");
      return;
    }

    router.push(provisioned.redirectTo || "/account");
  }

  async function resendConfirmation() {
    if (!confirmationEmail || pending) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    const result = await supabase.auth.resend({
      type: "signup",
      email: confirmationEmail,
      options: {
        emailRedirectTo: authCallbackUrl(redirectTo),
      },
    });
    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many confirmation emails have been requested. Please try again later."
          : "We couldn’t resend the confirmation email. Please try again.",
      );
    }
    setPending(false);
  }

  const professional = audience === "professional";
  const title =
    mode === "sign-in"
      ? professional
        ? "GLOHAUS PRO sign in"
        : "Customer sign in"
      : professional
        ? "Create your professional account"
        : "Create your account";
  const description =
    mode === "sign-in"
      ? professional
        ? "Sign in to manage your professional dashboard, bookings, clients and earnings."
        : "Sign in to your customer account to discover, book, shop and manage appointments."
      : professional
        ? "Start building your GLOHAUS PRO storefront today."
        : "Discover, save and book beauty that feels like you.";

  return (
    <form action={submit} className="auth-email-form">
      <p className="eyebrow">{professional ? "GLOHAUS PRO" : "GLOHAUS"}</p>
      <h1>{title}</h1>
      <p className="auth-email-intro">{description}</p>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      {mode === "sign-in" && (
        <p className="auth-switch">
          <Link href="/forgot-password">Forgot password?</Link>
        </p>
      )}
      {confirmationEmail && mode === "sign-up" && (
        <div className="form-notice" role="status">
          <p>
            Check <strong>{confirmationEmail}</strong> and use the newest GLOHAUS
            confirmation email. If the first link has expired or does not open
            correctly, request a fresh one below.
          </p>
          <button type="button" onClick={resendConfirmation} disabled={pending}>
            {pending ? "Sending…" : "Resend verification email"}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="button full-width" disabled={pending || Boolean(confirmationEmail)}>
        {pending
          ? "Please wait…"
          : mode === "sign-up"
            ? "Create account"
            : professional
              ? "Sign in to GLOHAUS PRO"
              : "Sign in as customer"}
      </button>
      <p className="auth-switch">
        {mode === "sign-in" ? (
          <>
            New to {professional ? "GLOHAUS PRO" : "GLOHAUS"}?{" "}
            <Link
              href={
                professional
                  ? "/sign-up?intent=professional&returnTo=/professional/setup"
                  : "/sign-up"
              }
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href={
                professional
                  ? "/sign-in?intent=professional&returnTo=/professional"
                  : "/sign-in"
              }
            >
              Sign in
            </Link>
          </>
        )}
      </p>
      {professional && (
        <Link className="auth-professional-preview" href="/professional-preview">
          Preview GLOHAUS PRO without signing in
        </Link>
      )}
    </form>
  );
}
