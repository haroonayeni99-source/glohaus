"use client";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
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
  const popover = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (popover.current?.open && !popover.current.contains(event.target as Node)) popover.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && popover.current?.open) { popover.current.open = false; popover.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [selected, theme] = current.split(":") as [ThemePreference, "light" | "night"];
  useEffect(() => {
    // Do not overwrite the pre-paint preference with a stale hydration snapshot.
    if (current === snapshot()) apply(theme);
  }, [current, theme]);
  const control = <div className="appearance-setting">
    <label htmlFor={id}>Appearance</label>
    <select id={id} value={selected} onChange={event => {
      const next = event.target.value as ThemePreference;
      temporaryPreference = next;
      try { localStorage.setItem(storageKey, next); } catch { /* Keep this session's choice usable. */ }
      apply(resolveTheme(next, matchMedia("(prefers-color-scheme: dark)").matches));
      window.dispatchEvent(new Event("glohaus-theme-change"));
      if (popover.current) { popover.current.open = false; popover.current.querySelector("summary")?.focus(); }
    }}>
      <option value="system">Use device setting</option>
      <option value="light">Light</option>
      <option value="night">Night</option>
    </select>
  </div>;
  if (inline) return control;
  return <div className="theme-toggle-layer"><details ref={popover} className="appearance-popover">
    <summary className="theme-toggle" aria-label="Appearance settings">
      {theme === "night" ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
      <span>{theme === "night" ? "Night" : "Light"}</span>
    </summary>
    <div className="appearance-popover-panel">{control}</div>
  </details></div>;
}
