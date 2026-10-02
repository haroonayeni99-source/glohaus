"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function passwordRecoveryCallbackUrl() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();

  try {
    const origin = configuredOrigin
      ? new URL(configuredOrigin).origin
      : window.location.origin;
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("next", "/reset-password");
    return callbackUrl.toString();
  } catch {
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", "/reset-password");
    return callbackUrl.toString();
  }
}

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    if (pending || sent) return;

    setPending(true);
    setMessage(null);
    setError(null);

    const email = String(formData.get("email") || "").trim();
    const supabase = createClient();

    const result = await supabase.auth.resetPasswordForEmail(email, {
      // Always send recovery emails back through the canonical production
      // callback. Preview/alias origins are commonly rejected by Supabase's
      // redirect allow-list, which makes Auth fall back to the Site URL.
      redirectTo: passwordRecoveryCallbackUrl(),
    });

    setPending(false);

    if (result.error) {
      const rateLimited =
        result.error.status === 429 ||
        result.error.message.toLowerCase().includes("rate limit");
      setError(
        rateLimited
          ? "Too many reset emails have been requested. Please wait before trying again."
          : "We couldn’t send a reset email right now. Please try again.",
      );
      return;
    }

    setSent(true);
    setMessage(
      "If an account exists for that email, we’ve sent a password reset link. Use the newest email and check your spam folder if needed.",
    );
  }

  return (
    <form action={submit} className="auth-email-form">
      <p className="eyebrow">GLOHAUS</p>
      <h1>Reset your password</h1>
      <p className="auth-email-intro">
        Enter the email address you use for GLOHAUS and we’ll send you a secure
        reset link.
      </p>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={sent}
        />
      </label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button className="button full-width" disabled={pending || sent}>
        {pending ? "Sending…" : sent ? "Reset link sent" : "Send reset link"}
      </button>
      <p className="auth-switch">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}
