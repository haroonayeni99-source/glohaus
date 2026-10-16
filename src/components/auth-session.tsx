"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SessionContext = createContext<boolean | undefined>(undefined);

// Presentation only. Protected pages and APIs still verify identity and roles
// on the server; a browser session never grants application permissions.
export function AuthSessionProvider({
  initialSignedIn,
  children,
}: {
  initialSignedIn: boolean;
  children?: ReactNode;
}) {
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const current = useRef<{ signedIn: boolean; userId?: string | null }>({
    signedIn: initialSignedIn,
  });
  const router = useRouter();
  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    try {
      const { data } = createClient().auth.onAuthStateChange(
        (_event, session) => {
          const next = Boolean(session?.user);
          const userId = session?.user?.id ?? null;
          const changed =
            current.current.signedIn !== next ||
            (current.current.userId !== undefined &&
              current.current.userId !== userId);
          current.current = { signedIn: next, userId };
          setSignedIn(next);
          // Refresh only identity transitions, not token refreshes or duplicate
          // SIGNED_IN events fired when a tab gains focus.
          if (changed) window.dispatchEvent(new CustomEvent("glohaus:identity-change", {detail:{signedIn:next,userId}}));
          if (changed)
            queueMicrotask(() => {
              if (active) router.refresh();
            });
        },
      );
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      /* Keep the verified server state if Auth is unavailable. */
    }
    const restore = (event: PageTransitionEvent) => {
      // Browser back/forward snapshots must not resurrect a signed-out account.
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("pageshow", restore);
    };
  }, [router]);
  return (
    <SessionContext.Provider value={signedIn}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSignedIn(fallback = false) {
  return useContext(SessionContext) ?? fallback;
}
