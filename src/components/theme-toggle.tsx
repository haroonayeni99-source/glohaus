"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

const storageKey = "glohaus-theme";

function applyTheme(theme: "light" | "night") {
  document.documentElement.dataset.theme = theme;
}

function readTheme(): "light" | "night" {
  const saved = window.localStorage.getItem(storageKey);
  return saved === "night" ||
    (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ? "night"
    : "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("glohaus-theme-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("glohaus-theme-change", onStoreChange);
  };
}

const serverTheme = () => "light" as const;

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readTheme,
    serverTheme,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next = theme === "night" ? "light" : "night";
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event("glohaus-theme-change"));
    applyTheme(next);
  }

  return (
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
  );
}
