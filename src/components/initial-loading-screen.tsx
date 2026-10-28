"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "./loading-screen";

/** A brief introduction on the first document load, never on client navigation. */
export function InitialLoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "done">("visible");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = window.setTimeout(() => {
      if (reduceMotion) {
        setPhase("done");
        return;
      }
      setPhase("leaving");
    }, reduceMotion ? 0 : 1900);
    return () => window.clearTimeout(hold);
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const finish = window.setTimeout(() => setPhase("done"), 250);
    return () => window.clearTimeout(finish);
  }, [phase]);

  if (phase === "done") return null;
  return <div className={`glohaus-intro${phase === "leaving" ? " is-leaving" : ""}`}><LoadingScreen initial /></div>;
}
