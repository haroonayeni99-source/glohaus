"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [pending,setPending]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function submit(formData: FormData) {
    setPending(true); setError(null);
    const password=String(formData.get("password")||"");
    const confirmPassword=String(formData.get("confirmPassword")||"");
    if(password.length<8){ setError("Use at least 8 characters for your new password."); setPending(false); return; }
    if(password!==confirmPassword){ setError("The passwords do not match."); setPending(false); return; }
    const supabase=createClient();
    const { error }=await supabase.auth.updateUser({password});
    setPending(false);
    if(error){ setError("We couldn’t update your password. Your reset link may have expired; request a new one and try again."); return; }
    await supabase.auth.signOut();
    setComplete(true);
  }

  if(complete) return <div className="auth-email-form">
    <p className="eyebrow">GLOHAUS</p><h1>Password updated</h1>
    <p className="auth-email-intro">Your password has been changed. You can now sign in with your new password.</p>
    <Link className="button full-width" href="/sign-in">Sign in</Link>
  </div>;

  return <form action={submit} className="auth-email-form">
    <p className="eyebrow">GLOHAUS</p><h1>Choose a new password</h1>
    <p className="auth-email-intro">Create a new password for your GLOHAUS account.</p>
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
    {error&&<p role="alert">{error}</p>}
    <button className="button full-width" disabled={pending}>{pending?"Updating…":"Update password"}</button>
  </form>;
}
