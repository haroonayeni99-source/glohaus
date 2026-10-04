"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const storageKey = "glohaus-theme";
const darkPreference = "(prefers-color-scheme: dark)";

function applyTheme(theme: "light" | "night") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "night" ? "dark" : "light";
}

function readTheme(): "light" | "night" {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    saved = document.documentElement.dataset.theme ?? null;
  }
  return saved === "night" ||
    (saved !== "light" && window.matchMedia(darkPreference).matches)
    ? "night"
    : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia(darkPreference);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("glohaus-theme-change", onStoreChange);
  media.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("glohaus-theme-change", onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

const serverTheme = () => "light" as const;

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, serverTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next = theme === "night" ? "light" : "night";
    applyTheme(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* Theme remains usable when browser storage is blocked. */
    }
    window.dispatchEvent(new Event("glohaus-theme-change"));
    applyTheme(next);
  }

  return (
    <div className="theme-toggle-layer" aria-hidden="false">
      <button
        className="theme-toggle"
        type="button"
        onClick={toggle}
        aria-label={`Switch to ${theme === "night" ? "light" : "night"} mode`}
        aria-pressed={theme === "night"}
        title={`Switch to ${theme === "night" ? "light" : "night"} mode`}
      >
        {theme === "night" ? <Sun size={18} /> : <Moon size={18} />}
        <span>{theme === "night" ? "Light" : "Night"}</span>
      </button>
    </div>
  );
}
