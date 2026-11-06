"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  socialPostLink,
  type SocialPost,
} from "@/modules/business-tools/domain";
export function TikTokPlayer({
  url,
  title,
  unavailable = false,
}: {
  url: string;
  title: string;
  unavailable?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<
    "loading" | "ready" | "playing" | "unconfirmed" | "error"
  >("loading");
  let embed = "";
  try {
    const post = socialPostLink(url);
    if (post.platform === "tiktok")
      embed = `https://www.tiktok.com/player/v1/${post.externalId}?autoplay=0&controls=1`;
  } catch {
    /* Invalid links never reach an iframe. */
  }
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(
      () => setPhase((p) => (p === "loading" ? "unconfirmed" : p)),
      15000,
    );
    function receive(event: MessageEvent) {
      if (
        event.origin !== "https://www.tiktok.com" ||
        event.source !== frame.current?.contentWindow ||
        !event.data ||
        event.data["x-tiktok-player"] !== true
      )
        return;
      if (event.data.type === "onPlayerReady") setPhase("ready");
      else if (event.data.type === "onStateChange" && event.data.value === 1)
        setPhase("playing");
      else if (
        event.data.type === "onStateChange" &&
        [0, 2].includes(event.data.value)
      )
        setPhase("ready");
      else if (
        event.data.type === "onPlayerError" ||
        event.data.type === "onError"
      )
        setPhase("error");
    }
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [loaded]);
  if (!embed)
    return <p>Video preview unavailable: check the original TikTok link.</p>;
  return (
    <div className="social-player-preview">
      {!loaded ? (
        <>
          <p>
            {unavailable
              ? "This video is no longer available in the connected account’s recent results."
              : "This is a linked TikTok video, not an uploaded GLOHAUS file. Loading the player connects to TikTok, which may use cookies."}
          </p>
          <button
            type="button"
            className="button"
            disabled={unavailable}
            onClick={() => {
              setPhase("loading");
              setLoaded(true);
            }}
          >
            Load TikTok player
          </button>
        </>
      ) : (
        <>
          <iframe
            ref={frame}
            src={embed}
            title={title}
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setPhase("error")}
          />
          <p role="status" aria-live="polite">
            {phase === "playing"
              ? "Playing on TikTok."
              : phase === "ready"
                ? "Player ready. Press Play in the video."
                : phase === "error"
                  ? "TikTok could not play this video. It may be unavailable or restricted; try the original link."
                  : phase === "unconfirmed"
                    ? "Playback has not been confirmed. If the player is blank or blocked, open the original on TikTok."
                    : "Opening the TikTok player…"}
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setLoaded(false)}
          >
            Close TikTok player
          </button>
        </>
      )}
      <p>
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open original on TikTok ↗
        </a>
      </p>
    </div>
  );
}
export function SocialPostPreview({ post }: { post: SocialPost }) {
  const [coverFailed, setCoverFailed] = useState(false);
  if (post.platform !== "tiktok") return null;
  return (
    <div className="social-management-preview">
      <h3>TikTok video preview</h3>
      {post.has_thumbnail && !coverFailed ? (
        <Image
          src={`/api/v1/professional/social/${post.id}/thumbnail`}
          width={270}
          height={360}
          unoptimized
          alt="TikTok video cover"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="social-preview-placeholder">
          <span aria-hidden>▶</span>
          <strong>TikTok video</strong>
          <small>
            {coverFailed
              ? "Cover unavailable. Use the player below."
              : "No cover image supplied. Use the player below."}
          </small>
        </div>
      )}
      <TikTokPlayer
        url={post.original_url}
        title="Preview your linked TikTok video"
        unavailable={
          post.source_available === false ||
          post.publication_status === "unavailable"
        }
      />
    </div>
  );
}
