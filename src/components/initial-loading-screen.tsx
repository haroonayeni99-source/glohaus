"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "./loading-screen";

/** Branded entry fallback only: no minimum duration and no replay on SPA navigation. */
export function InitialLoadingScreen() {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const observer = new MutationObserver(checkReady);
    function checkReady() {
      if (!document.querySelector("[data-glohaus-route-pending]")) {
        observer.disconnect();
        if (active) setComplete(true);
      }
    }
    observer.observe(document.body, { childList: true, subtree: true });
    // Check the committed document, rather than holding the website for a logo
    // asset, animation, image download or an arbitrary introductory timer.
    queueMicrotask(checkReady);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  if (complete) return null;
  return <div className="glohaus-intro"><LoadingScreen initial /></div>;
}
