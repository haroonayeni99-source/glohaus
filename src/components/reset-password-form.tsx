"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session) && !sessionError);
      setCheckingSession(false);
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  async function submit(formData: FormData) {
    if (!hasRecoverySession || pending) return;

    setPending(true);
    setError(null);

    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      setPending(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      setPending(false);
      return;
    }

    const result = await supabase.auth.updateUser({ password });
    if (result.error) {
      setError(
        "We couldn’t update your password. Your reset link may have expired; request a new one and try again.",
      );
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    setPending(false);
    setComplete(true);
  }

  if (complete)
    return (
      <div className="auth-email-form">
        <p className="eyebrow">GLOHAUS</p>
        <h1>Password updated</h1>
        <p className="auth-email-intro">
          Your password has been changed. You can now sign in with your new
          password.
        </p>
        <Link className="button full-width" href="/sign-in">
          Sign in
        </Link>
      </div>
    );

  if (checkingSession)
    return (
      <div className="auth-email-form">
        <p className="eyebrow">GLOHAUS</p>
        <h1>Checking reset link…</h1>
        <p className="auth-email-intro">
          We’re securely confirming your password-reset session.
        </p>
      </div>
    );

  if (!hasRecoverySession)
    return (
      <div className="auth-email-form">
        <p className="eyebrow">GLOHAUS</p>
        <h1>Reset link expired</h1>
        <p className="auth-email-intro">
          This reset link is no longer valid. Request a fresh password-reset
          email and use the newest link.
        </p>
        <Link className="button full-width" href="/forgot-password">
          Request a new reset link
        </Link>
        <p className="auth-switch">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </div>
    );

  return (
    <form action={submit} className="auth-email-form">
      <p className="eyebrow">GLOHAUS</p>
      <h1>Choose a new password</h1>
      <p className="auth-email-intro">
        Create a new password for your GLOHAUS account.
      </p>
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button full-width" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
