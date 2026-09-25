"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

export function FollowProfessionalButton({
  professionalId,
  initialFollowing,
  initialFollowerCount,
  signedIn,
}: {
  professionalId: string;
  initialFollowing: boolean;
  initialFollowerCount: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    if (!signedIn) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/follows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, following: !following }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error("Follow is available to customer accounts.");
      setFollowing(result.following);
      setCount(result.followerCount);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update follow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="professional-follow-control">
      <button
        type="button"
        className={following ? "follow-button is-following" : "follow-button"}
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
      >
        <Heart size={17} fill={following ? "currentColor" : "none"} aria-hidden />
        {busy ? "Updating…" : following ? "Following" : "Follow"}
      </button>
      <span className="follower-count">
        <strong>{count.toLocaleString("en-GB")}</strong>{" "}
        {count === 1 ? "follower" : "followers"}
      </span>
      {message && <small role="status" className="follow-message">{message}</small>}
    </div>
  );
}
