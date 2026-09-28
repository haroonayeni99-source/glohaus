"use client";

import { useEffect } from "react";

export function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const isRecovery =
      hash.includes("type=recovery") ||
      search.includes("type=recovery");

    if (!isRecovery) return;

    window.location.replace(
      `/reset-password${search}${hash}`,
    );
  }, []);

  return null;
}
