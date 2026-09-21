"use client";
import { useState } from "react";
import { Heart, Bookmark, Share2 } from "lucide-react";
import type { Engagement } from "@/modules/engagement/domain";
export function PostActions({
  id,
  title,
  value,
  onChange,
  onNotice,
  requireAuth,
  editorial = false,
}: {
  id: string;
  title: string;
  value: Engagement;
  onChange: (id: string, value: Engagement) => Promise<void>;
  onNotice: (message: string) => void;
  requireAuth?: (id: string, value: Engagement) => void;
  editorial?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  async function toggle(key: keyof Engagement) {
    const next = { ...value, [key]: !value[key] };
    if (requireAuth) {
      requireAuth(id, next);
      return;
    }
    setBusy(true);
    try {
      await onChange(id, next);
    } catch {
      onNotice("Could not update this post. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function openShare() {
    setShareUrl(
      new URL(
        editorial ? `/#post-${id}` : `/posts/${id}`,
        window.location.origin,
      ).href,
    );
  }
  async function share(native = false) {
    const url = shareUrl;
    try {
      if (native && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onNotice("Link copied. Share it wherever you like.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onNotice(`Share this link: ${url}`);
    }
  }
  return (
    <div className="post-actions" aria-label={`Actions for ${title}`}>
      <button
        disabled={busy}
        aria-pressed={value.liked}
        aria-label={`${value.liked ? "Unlike" : "Like"} ${title}`}
        onClick={() => toggle("liked")}
      >
        <Heart fill={value.liked ? "currentColor" : "none"} />
        <span>Like</span>
      </button>
      <button
        disabled={busy}
        aria-pressed={value.saved}
        aria-label={`${value.saved ? "Unsave" : "Save"} ${title}`}
        onClick={() => toggle("saved")}
      >
        <Bookmark fill={value.saved ? "currentColor" : "none"} />
        <span>Save</span>
      </button>
      <button
        aria-label={`Share ${title}`}
        aria-expanded={Boolean(shareUrl)}
        onClick={openShare}
      >
        <Share2 />
        <span>Share</span>
      </button>
      {shareUrl && (
        <div
          className="post-share-panel"
          role="group"
          aria-label="Share options"
        >
          <label>
            Post link
            <input
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button onClick={() => share(false)}>Copy link</button>
          {typeof navigator !== "undefined" && Boolean(navigator.share) && (
            <button onClick={() => share(true)}>Share via device</button>
          )}
          <button onClick={() => setShareUrl("")}>Close</button>
        </div>
      )}
    </div>
  );
}
