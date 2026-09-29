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
              emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
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
      setError("Check your email to confirm your account, then return here to sign in.");
      setPending(false);
      return;
    }

    // Bootstrap owner routing fallback only. /admin still performs the real
    // server-side role and MFA authorization before showing privileged data.
    if (
      mode === "sign-in" &&
      result.data.user?.id === "78302631-b174-4c4c-9373-0cd4938b03a1"
    ) {
      router.push("/admin");
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

    let verified = await serverAccount();
    if (!verified.ok) {
      await supabase.auth.refreshSession();
      verified = await serverAccount();
    }

    if (verified.ok) {
      const me = await verified.json();
      router.push(
        signedInDestination(me?.account?.roles, audience, redirectTo),
      );
      return;
    }

    if (audience === "professional") {
      router.push("/professional-preview");
      return;
    }

    const account = await provisionCustomer();
    if (!account) {
      router.push("/customer-preview");
      return;
    }
    router.push(account.redirectTo || "/account");
  }

  const professional = audience === "professional";
  const title =
    mode === "sign-in"
      ? "Welcome back"
      : professional
        ? "Create your professional account"
        : "Create your account";
  const description =
    mode === "sign-in"
      ? "Sign in to continue your GLOHAUS journey."
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
      {error && <p role="alert">{error}</p>}
      <button className="button full-width" disabled={pending}>
        {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
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
