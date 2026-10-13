// Real homepage components; fictional account data and no production requests.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/desktop-home-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch();
const styles = await readFile("src/app/site-improvements.css", "utf8");
const desktopStart = styles.indexOf("/* Desktop home only:");
const desktopEnd = styles.indexOf("/* The same sign-out control everywhere", desktopStart);
if (desktopStart < 0 || desktopEnd < 0) throw new Error("Desktop CSS boundary not found");
// Shared sign-out/badge rules apply in both comparison states. Remove only the
// desktop homepage block when checking that its media query leaves mobile intact.
const desktopCss = styles.slice(desktopStart, desktopEnd);
const categories = ["hair", "nails", "barber", "waxing", "injectables"];
const placeholder = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
const results = [];
try {
  for (const theme of ["light", "night"]) {
    for (const width of [1100, 1280, 1440, 1920]) {
      for (const guest of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.request().resourceType() === "image" ? route.fulfill({ contentType: "image/png", body: placeholder }) : route.abort());
        await page.route("**/images/categories/*", async route => {
          const name = new URL(route.request().url()).pathname.split("/").pop();
          expect(categories.some(category => name === `${category}-v2.webp`)).toBe(true);
          await route.fulfill({ contentType: "image/webp", body: await readFile(`public/images/categories/${name}`) });
        });
        await page.goto(`http://127.0.0.1:3004/?theme=${theme}${guest ? "&guest=1" : ""}`);
        // The isolated Image shim does not supply Next's inline fill styles.
        await page.addStyleTag({ content: ".desktop-service-row img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" });
        const logo = page.locator(".customer-desktop-sidebar > .brand");
        await expect(logo).toBeVisible();
        const sidebar = await page.locator(".customer-desktop-sidebar").boundingBox();
        const bounds = await logo.boundingBox();
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(sidebar.x + sidebar.width - 16);
        for (const category of categories) {
          const image = page.locator(`.desktop-service-row img[src='/images/categories/${category}-v2.webp']`);
          await expect(image).toBeVisible();
          await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 360)).toBe(true);
        }
        if (!guest) {
          const button = page.locator(".customer-desktop-topbar button");
          await expect(button).toHaveText("Sign out");
          const box = await button.boundingBox();
          const topbar = await page.locator(".customer-desktop-topbar").boundingBox();
          expect(box.x + box.width).toBeLessThanOrEqual(topbar.x + topbar.width + 1);
          expect(box.height).toBeGreaterThanOrEqual(38);
          expect(await button.evaluate(el => getComputedStyle(el).borderRadius)).toBe("999px");
          await button.hover();
          await button.focus();
          expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
        }
        if (width === 1440 && !guest) {
          await page.locator(".home-topline").click();
          await page.screenshot({ path: `reports/desktop-home-${theme}.png`, fullPage: false });
        }
        expect(errors).toEqual([]);
        results.push({ theme, width, guest, passed: true });
        await page.close();
      }
    }
    for (const width of [320, 390, 760, 1099]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.request().resourceType() === "image" ? route.fulfill({ contentType: "image/png", body: placeholder }) : route.abort());
      await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
      await expect(page.locator(".mobile-customer-home")).toBeVisible();
      await expect(page.locator(".desktop-customer-home")).toBeHidden();
      const before = await page.screenshot();
      await page.evaluate(css => {
        const style = document.querySelector("style");
        if (!style.textContent.includes(css)) throw new Error("Cannot establish mobile baseline");
        style.textContent = style.textContent.replace(css, "");
      }, desktopCss);
      const baseline = await page.screenshot();
      expect(before.equals(baseline), `Mobile pixels changed at ${width}px in ${theme}`).toBe(true);
      results.push({ theme, width, mobileUnchanged: true, passed: true });
      await page.close();
    }
  }
  await writeFile("reports/desktop-home-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
