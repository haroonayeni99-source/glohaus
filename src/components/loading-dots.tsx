"use client";

import { useEffect, useState } from "react";

/** Mount only for real pending work; fast responses never display an indicator. */
export function LoadingDots({ busy = true }: { busy?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setVisible(true), 200);
    return () => {
      window.clearTimeout(timer);
      setVisible(false);
    };
  }, [busy]);
  if (!busy || !visible) return null;
  return (
    <span className="glohaus-loading-dots" role="status" aria-label="Loading">
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}
