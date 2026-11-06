"use client";
import { useEffect, useId, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { appThemeColors } from "@/lib/app-theme-colors";
import { resolveTheme, type ThemePreference } from "@/lib/theme-preference";
const storageKey = "glohaus-theme";
let temporaryPreference: ThemePreference | undefined;
function preference(): ThemePreference {
  if (temporaryPreference) return temporaryPreference;
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "light" || value === "night") return value;
  } catch { /* OS preference remains the default when storage is blocked. */ }
  return "system";
}
function snapshot() {
  const selected = preference();
  return `${selected}:${resolveTheme(selected, matchMedia("(prefers-color-scheme: dark)").matches)}`;
}
function apply(theme: "light" | "night") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = appThemeColors[theme]; });
}
function subscribe(change: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const storage = () => { temporaryPreference = undefined; change(); };
  window.addEventListener("storage", storage);
  window.addEventListener("glohaus-theme-change", change);
  media.addEventListener("change", change);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("glohaus-theme-change", change);
    media.removeEventListener("change", change);
  };
}
const serverSnapshot = () => "system:light";
export function ThemeToggle({ inline = false }: { inline?: boolean }) {
  const id = useId();
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [selected, theme] = current.split(":") as [ThemePreference, "light" | "night"];
  useEffect(() => {
    // Do not overwrite the pre-paint preference with a stale hydration snapshot.
    if (current === snapshot()) apply(theme);
  }, [current, theme]);
  function choose(next: ThemePreference) {
    temporaryPreference = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Keep this session's choice usable. */ }
    apply(resolveTheme(next, matchMedia("(prefers-color-scheme: dark)").matches));
    window.dispatchEvent(new Event("glohaus-theme-change"));
  }
  if (inline) return <div className="appearance-setting">
    <label htmlFor={id}>Appearance</label>
    <select id={id} value={selected} onChange={event => choose(event.target.value as ThemePreference)}>
      <option value="system">Use device setting</option>
      <option value="light">Light</option>
      <option value="night">Night</option>
    </select>
  </div>;
  const next = theme === "night" ? "light" : "night";
  return <div className="theme-toggle-layer">
    <button className="theme-toggle" type="button" onClick={() => choose(next)}
      aria-label={`Switch to ${next} mode`} aria-pressed={theme === "night"} title={`Switch to ${next} mode`}>
      {theme === "night" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      <span>{theme === "night" ? "Light" : "Night"}</span>
    </button>
  </div>;
}
