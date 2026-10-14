"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { finishSignOut } from "@/lib/session-navigation";
import { useSignedIn } from "./auth-session";
export function AccountControls() {
  const signedIn = useSignedIn(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!signedIn) return null;
  return (
    <>
      <button
        type="button"
        className="text-link glohaus-signout"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const result = await createClient().auth.signOut();
            if (result?.error) throw result.error;
            finishSignOut();
          } catch {
            setError("We could not sign you out. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <span className="form-notice" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
