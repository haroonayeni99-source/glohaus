"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "./loading-screen";

/** A brief introduction on the first document load, never on client navigation. */
export function InitialLoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "done">("visible");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hold: number | undefined;
    let fallback: number | undefined;
    let started = false;
    const image = document.querySelector<HTMLImageElement>(
      document.documentElement.dataset.theme === "night"
        ? ".glohaus-intro .glohaus-route-wordmark-night"
        : ".glohaus-intro .glohaus-route-wordmark-light",
    );
    const startHold = () => {
      if (started) return;
      started = true;
      window.clearTimeout(fallback);
      hold = window.setTimeout(() => setPhase(reduceMotion ? "done" : "leaving"), reduceMotion ? 900 : 1900);
    };
    if (!image || (image.complete && image.naturalWidth > 0)) {
      startHold();
    } else {
      image.addEventListener("load", startHold, { once: true });
      image.addEventListener("error", startHold, { once: true });
      // Never leave visitors waiting indefinitely if an asset or network fails.
      fallback = window.setTimeout(startHold, 1200);
    }
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(fallback);
      image?.removeEventListener("load", startHold);
      image?.removeEventListener("error", startHold);
    };
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const finish = window.setTimeout(() => setPhase("done"), 250);
    return () => window.clearTimeout(finish);
  }, [phase]);

  if (phase === "done") return null;
  return <div className={`glohaus-intro${phase === "leaving" ? " is-leaving" : ""}`}><LoadingScreen initial /></div>;
}
