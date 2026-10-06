"use client";

import Link from "next/link";
import { useState } from "react";

export function MarketingUnsubscribe({token}:{token:string}) {
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");

  async function unsubscribe() {
    setBusy(true); setError("");
    try {
      const response=await fetch("/api/v1/marketing/unsubscribe",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token}),
      });
      if(!response.ok) throw new Error("We could not update this preference link.");
      setDone(true);
    } catch(error) {
      setError(error instanceof Error?error.message:"We could not update this preference link.");
    } finally { setBusy(false); }
  }

  if(done) return (
    <div className="empty-panel">
      <h2>You are unsubscribed from optional GLOHAUS marketing.</h2>
      <p>Essential service emails remain available when they are needed for your account or transactions.</p>
      <Link className="text-link" href="/sign-in?returnTo=%2Fpreferences">Sign in to choose individual preferences</Link>
    </div>
  );

  return (
    <div className="empty-panel">
      <p>Use this link to stop all optional GLOHAUS marketing. You can turn individual categories back on later from your signed-in preferences page.</p>
      <button className="button" disabled={busy || !token} onClick={()=>void unsubscribe()}>
        {busy?"Updating…":"Unsubscribe from optional marketing"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
