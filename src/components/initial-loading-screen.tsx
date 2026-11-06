"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "./loading-screen";

/** The approved entrance runs once per document, never on client navigation. */
export function InitialLoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "done">("visible");
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let active = true;
    let started = false;
    let minimumElapsed = false;
    let hold: number | undefined;
    let imageFallback: number | undefined;
    const observer = new MutationObserver(checkReady);
    const image = document.querySelector<HTMLImageElement>(
      document.documentElement.dataset.theme === "night"
        ? ".glohaus-intro .glohaus-route-wordmark-night"
        : ".glohaus-intro .glohaus-route-wordmark-light",
    );
    function checkReady() {
      if (
        !active ||
        !minimumElapsed ||
        document.querySelector("[data-glohaus-route-pending]")
      )
        return;
      observer.disconnect();
      setPhase(reducedMotion ? "done" : "leaving");
    }
    function startHold() {
      if (!active || started) return;
      started = true;
      window.clearTimeout(imageFallback);
      hold = window.setTimeout(
        () => {
          minimumElapsed = true;
          checkReady();
        },
        reducedMotion ? 900 : 1900,
      );
    }
    observer.observe(document.body, { childList: true, subtree: true });
    if (!image || (image.complete && image.naturalWidth > 0)) startHold();
    else {
      image.addEventListener("load", startHold, { once: true });
      image.addEventListener("error", startHold, { once: true });
      imageFallback = window.setTimeout(startHold, 1200);
    }
    // The server also supplies a no-hydration CSS/JS escape hatch. Data failures
    // reveal the local page placeholder rather than trapping the whole website.
    const safety = window.setTimeout(() => {
      observer.disconnect();
      if (active) setPhase("done");
    }, 6000);
    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(hold);
      window.clearTimeout(imageFallback);
      window.clearTimeout(safety);
      image?.removeEventListener("load", startHold);
      image?.removeEventListener("error", startHold);
    };
  }, []);
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), 250);
    return () => window.clearTimeout(timer);
  }, [phase]);
  if (phase === "done") return null;
  return (
    <div className={`glohaus-intro${phase === "leaving" ? " is-leaving" : ""}`}>
      <LoadingScreen initial />
    </div>
  );
}
