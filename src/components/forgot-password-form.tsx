"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function submit(formData: FormData) {
    setPending(true); setMessage(null); setError(null);
    const email=String(formData.get("email")||"").trim();
    const supabase=createClient();
    const { error }=await supabase.auth.resetPasswordForEmail(email,{
      redirectTo:`${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setPending(false);
    if(error){ setError(error.message); return; }
    setMessage("If an account exists for that email, we’ve sent a password reset link. Check your inbox and spam folder.");
  }

  return <form action={submit} className="auth-email-form">
    <p className="eyebrow">GLOHAUS</p>
    <h1>Reset your password</h1>
    <p className="auth-email-intro">Enter the email address you use for GLOHAUS and we’ll send you a secure reset link.</p>
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert">{error}</p>}
    <button className="button full-width" disabled={pending}>{pending?"Sending…":"Send reset link"}</button>
    <p className="auth-switch"><Link href="/sign-in">Back to sign in</Link></p>
  </form>;
}
