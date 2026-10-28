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
  entryPoints: ["src/app/loading.tsx"], bundle: true, platform: "node",
  format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"], write: false,
}).outputFiles[0].text;
const moduleBox = { exports: {} as { default: React.ComponentType } };
new Function("require", "module", "exports", compiled)(
  createRequire(`${process.cwd()}/package.json`), moduleBox, moduleBox.exports,
);
const html = renderToStaticMarkup(React.createElement(moduleBox.exports.default))
  .replaceAll("/images/glohaus-wordmark.png", `data:image/png;base64,${readFileSync("public/images/glohaus-wordmark.png").toString("base64")}`)
  .replaceAll("/images/glohaus-wordmark-night.png", `data:image/png;base64,${readFileSync("public/images/glohaus-wordmark-night.png").toString("base64")}`);

for (const theme of ["light", "night"] as const) {
  test(`loading screen fits and uses the approved ${theme} wordmark`, async ({ page }, testInfo) => {
    const width = testInfo.project.name === "mobile" ? 320 : 1440;
    await page.setViewportSize({ width, height: testInfo.project.name === "mobile" ? 568 : 900 });
    await page.goto("about:blank");
    await page.setContent(`<html data-theme="${theme}"><head><base href="http://127.0.0.1:3000/"><style>${css}</style></head><body>${html}</body></html>`);
    const logo = page.locator(theme === "night" ? ".glohaus-route-wordmark-night" : ".glohaus-route-wordmark-light");
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(theme === "night" ? 2048 : 1220);
    await expect(page.locator(".glohaus-route-slogan")).toHaveText("Look Good. Feel Good. Stand Out.");
    const fits = await page.evaluate(({ theme }) => {
      const frame = document.querySelector(".glohaus-route-wordmark")!.getBoundingClientRect();
      const image = document.querySelector(theme === "night" ? ".glohaus-route-wordmark-night" : ".glohaus-route-wordmark-light") as HTMLImageElement;
      const box = image.getBoundingClientRect();
      const bounds = theme === "night" ? [397, 303, 1647, 446] : [130, 487, 1096, 598];
      const scale = box.width / image.naturalWidth;
      return box.left + bounds[0] * scale >= frame.left && box.top + bounds[1] * scale >= frame.top && box.left + bounds[2] * scale <= frame.right && box.top + bounds[3] * scale <= frame.bottom && document.documentElement.scrollWidth <= innerWidth;
    }, { theme });
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
