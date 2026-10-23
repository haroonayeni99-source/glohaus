import type { ReactNode } from "react";

export function GlohausSplashScreen({ className = "" }: { className?: string }) {
  return (
    <div className={`glohaus-splash-screen ${className}`} role="status" aria-live="polite" aria-label="Loading GLOHAUS">
      <div className="glohaus-splash-art" aria-hidden="true" />
      <div className="glohaus-splash-indicator" aria-hidden="true"><span className="glohaus-splash-ring" /><span className="glohaus-splash-bar" /></div>
      <span className="sr-only">Loading GLOHAUS. Please wait.</span>
    </div>
  );
}
