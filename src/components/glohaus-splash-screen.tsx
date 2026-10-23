import type { ReactNode } from "react";

export function GlohausSplashScreen({ className = "" }: { className?: string }) {
  return (
    <div className={`glohaus-splash-screen ${className}`} role="status" aria-live="polite" aria-label="Loading GLOHAUS">
      <div className="glohaus-splash-art" aria-hidden="true" />
      <span className="sr-only">Loading GLOHAUS. Please wait.</span>
    </div>
  );
}
