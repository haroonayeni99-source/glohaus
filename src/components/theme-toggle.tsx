"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const storageKey = "glohaus-theme";

function applyTheme(theme: "light" | "night") {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "night">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const next =
      saved === "night" ||
      (saved !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "night"
        : "light";
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggle() {
    const next = theme === "night" ? "light" : "night";
    setTheme(next);
    window.localStorage.setItem(storageKey, next);
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
