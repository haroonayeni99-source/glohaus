import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

const css = readFileSync("src/app/glohaus-splash.css", "utf8");
// Compile the real component with React's JSX runtime rather than Playwright's
// component-testing transform, which produces a different element format.
const compiled = buildSync({
  entryPoints: ["src/components/loading-screen.tsx"], bundle: true, platform: "node",
  format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"], write: false,
}).outputFiles[0].text;
const moduleBox = { exports: {} as { LoadingScreen: React.ComponentType } };
new Function("require", "module", "exports", compiled)(
  createRequire(`${process.cwd()}/package.json`), moduleBox, moduleBox.exports,
);
const html = renderToStaticMarkup(React.createElement(moduleBox.exports.LoadingScreen));

for (const theme of ["light", "night"] as const) {
  test(`loading screen fits and uses the approved ${theme} wordmark`, async ({ page }, testInfo) => {
    const width = testInfo.project.name === "mobile" ? 320 : 1440;
    await page.setViewportSize({ width, height: testInfo.project.name === "mobile" ? 568 : 900 });
    await page.goto("about:blank");
    await page.setContent(`<html data-theme="${theme}"><head><base href="http://127.0.0.1:3000/"><style>${css}</style></head><body>${html}</body></html>`);
    const logo = page.locator(theme === "night" ? ".glohaus-route-wordmark-night" : ".glohaus-route-wordmark-light");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", theme === "night" ? "/images/glohaus-wordmark-night.png" : "/images/glohaus-wordmark.png");
    await expect(page.locator(".glohaus-route-slogan")).toHaveText("Look Good. Feel Good. Stand Out.");
    const fits = await page.evaluate(() => {
      const frame = document.querySelector(".glohaus-route-wordmark")!.getBoundingClientRect();
      const logo = document.querySelector(".glohaus-route-loading-content")!.getBoundingClientRect();
      return frame.left >= 0 && frame.right <= innerWidth && logo.left >= 0 && logo.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    });
    expect(fits).toBe(true);
  });
}

test("reduced motion shows the complete screen without animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("about:blank");
  await page.setContent(`<html data-theme="night"><head><base href="http://127.0.0.1:3000/"><style>${css}</style></head><body>${html}</body></html>`);
  await expect(page.locator(".glohaus-route-slogan")).toBeVisible();
  await expect(page.locator(".glohaus-route-wordmark")).toHaveCSS("animation-name", "none");
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`entrance releases the page without JavaScript (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("about:blank");
    const siteMotionRule = "@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}";
    await page.setContent(`<style>${siteMotionRule}${css}</style><button>Continue browsing</button><div class="glohaus-intro">${html}</div>`);
    await expect(page.getByRole("status", { name: "Loading GLOHAUS" })).toBeHidden({ timeout: 8000 });
    await page.getByRole("button", { name: "Continue browsing" }).click();
  });
}
