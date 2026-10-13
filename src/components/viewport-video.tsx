"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

type Player = { ratio: number; activate: (active: boolean) => void };
// Registered only in client effects. One visible clip plays at a time, including
// when several portfolio tiles share a row.
const players = new Map<HTMLVideoElement, Player>();
let selected: HTMLVideoElement | undefined;
function selectPlayer() {
  let next: HTMLVideoElement | undefined;
  let best = 0.5;
  if (!document.hidden) {
    if (selected && (players.get(selected)?.ratio ?? 0) >= best) {
      next = selected;
      best = players.get(selected)!.ratio;
    }
    for (const [video, player] of players)
      if (player.ratio >= 0.5 && (!next || player.ratio > best)) {
        next = video;
        best = player.ratio;
      }
  }
  selected = next;
  for (const [video, player] of players) player.activate(video === next);
}

export function ViewportVideo({
  src,
  label,
  variant = "portfolio",
}: {
  src: string;
  label: string;
  variant?: "feed" | "portfolio";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const active = useRef(false);
  const userPaused = useRef(false);
  const pending = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    function play() {
      if (pending.current) return;
      pending.current = true;
      void video
        .play()
        .catch(() => {
          // Autoplay restrictions leave a working, explicit Play control.
          if (!disposed) setPlaying(false);
        })
        .finally(() => {
          pending.current = false;
        });
    }
    players.set(video, {
      ratio: 0,
      activate(next) {
        if (active.current === next) return;
        active.current = next;
        if (next && !userPaused.current && !motion.matches) play();
        else video.pause();
      },
    });
    function onPlay() {
      if (!active.current || document.hidden) video.pause();
      else setPlaying(true);
    }
    function onPause() {
      setPlaying(false);
    }
    function onReady() {
      if (active.current && !userPaused.current && !motion.matches) play();
    }
    function onMotionChange() {
      if (motion.matches) video.pause();
      else onReady();
    }
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("canplay", onReady);
    motion.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", selectPlayer);
    const observer = new IntersectionObserver(
      ([entry]) => {
        const player = players.get(video);
        if (!player) return;
        player.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        // A manual pause remains in force until the viewer presses Play.
        selectPlayer();
      },
      { threshold: [0, 0.5, 0.75, 1] },
    );
    observer.observe(video);
    return () => {
      disposed = true;
      observer.disconnect();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("canplay", onReady);
      motion.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", selectPlayer);
      video.pause();
      players.delete(video);
      active.current = false;
      selectPlayer();
    };
  }, [src]);

  async function toggle() {
    const video = ref.current!;
    if (!video.paused) {
      userPaused.current = true;
      video.pause();
      return;
    }
    userPaused.current = false;
    selected = video;
    for (const [other, player] of players) player.activate(other === video);
    if (failed) {
      setFailed(false);
      video.load();
    }
    try {
      await video.play();
    } catch {
      setPlaying(false);
    }
  }

  const description = label.trim() || "Beauty portfolio video";
  return (
    <div className={`viewport-video viewport-video--${variant}`}>
      <video
        ref={ref}
        src={src}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        aria-label={description}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />
      <button
        type="button"
        className="viewport-video-toggle"
        aria-label={`${playing ? "Pause" : failed ? "Retry" : "Play"} video: ${description}`}
        onClick={() => void toggle()}
      >
        {!playing && (
          <span className="viewport-video-play">
            <Play size={28} fill="currentColor" aria-hidden />
          </span>
        )}
      </button>
      <button
        type="button"
        className="viewport-video-sound"
        aria-label={`${muted ? "Unmute" : "Mute"} video: ${description}`}
        onClick={() => setMuted(!muted)}
      >
        {muted ? (
          <VolumeX size={18} aria-hidden />
        ) : (
          <Volume2 size={18} aria-hidden />
        )}
      </button>
      {failed && (
        <p className="viewport-video-error" role="status">
          This video couldn’t load. Tap to try again.
        </p>
      )}
    </div>
  );
}
