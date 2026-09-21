"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function EmailAuthForm({ mode, redirectTo }: { mode: "sign-in" | "sign-up"; redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); setError(null);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const supabase = createClient();
    const result = mode === "sign-up"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}` } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); setPending(false); return; }
    if (mode === "sign-up" && !result.data.session) { setError("Check your email to confirm your account, then return here to sign in."); setPending(false); return; }
    router.replace(redirectTo); router.refresh();
  }
  return <form action={submit} className="auth-email-form">
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    <label>Password<input name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required /></label>
    {error && <p role="alert">{error}</p>}
    <button className="button full-width" disabled={pending}>{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
  </form>;
}
