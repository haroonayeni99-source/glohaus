"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
type FollowState = { following: boolean; followerCount: number };

export function DiscoverFollowButton({
  professionalId,
  state,
  signedIn,
  returnTo,
  onChange,
}: {
  professionalId: string;
  state: FollowState;
  signedIn: boolean;
  returnTo: string;
  onChange: (professionalId: string, state: FollowState) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/v1/follows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          following: !state.following,
        }),
      });
      if (!response.ok) throw new Error();
      const next = (await response.json()) as FollowState;
      onChange(professionalId, next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={state.following ? "discover-follow is-following" : "discover-follow"}
      aria-pressed={state.following}
      disabled={busy}
      onClick={toggle}
    >
      {busy ? "Updating…" : state.following ? "Following" : "Follow"}
    </button>
  );
}
