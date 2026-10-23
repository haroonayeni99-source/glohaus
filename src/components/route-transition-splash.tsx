"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GlohausSplashScreen } from "@/components/glohaus-splash-screen";

function NavigationWatcher() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [show, setShow] = useState(false);
  const showTimer = useRef<number | null>(null);
  const stopTimer = useRef<number | null>(null);

  useEffect(() => {
    setShow(false);
    if (showTimer.current) clearTimeout(showTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    showTimer.current = null;
    stopTimer.current = null;
  }, [pathname, search]);

  useEffect(() => {
    const clearLoading = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      showTimer.current = null;
      stopTimer.current = null;
      setShow(false);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
          event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link || link.hasAttribute("download") || (link.getAttribute("target") && link.getAttribute("target") !== "_self")) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
      const before = window.location;
      if (url.pathname === before.pathname && url.search === before.search) return;
      // Wait until bubbling handlers can cancel navigation before arming the splash.
      window.setTimeout(() => {
        if (event.defaultPrevented) return;
        clearLoading();
        // No artificial delay: only show the branded screen on slower transitions.
        showTimer.current = window.setTimeout(() => {
          setShow(true);
          // Never trap customers on checkout or a failed navigation.
          stopTimer.current = window.setTimeout(clearLoading, 9000);
        }, 170);
      }, 0);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", clearLoading);
    window.addEventListener("pageshow", clearLoading);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", clearLoading);
      window.removeEventListener("pageshow", clearLoading);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, []);

  return show ? <GlohausSplashScreen /> : null;
}

/** Suspense is required for query-string-aware transitions in the App Router. */
export function RouteTransitionSplash() {
  return <Suspense fallback={null}><NavigationWatcher /></Suspense>;
}
