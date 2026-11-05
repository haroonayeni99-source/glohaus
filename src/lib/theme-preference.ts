import { appThemeColors } from "./app-theme-colors";
export type ThemePreference = "light" | "night" | "system";
export function resolveTheme(preference: string | null, systemDark: boolean): "light" | "night" {
  return preference === "night" || (preference !== "light" && systemDark) ? "night" : "light";
}
// Nonce-bearing head script and hydrated controls use the same resolver.
export const themeBootstrap = `(() => {
  let saved = null;
  try { saved = window.localStorage.getItem("glohaus-theme"); } catch {}
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = (${resolveTheme.toString()})(saved, dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
  const color = ${JSON.stringify(appThemeColors)}[theme];
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => { meta.content = color; });
})();`;
