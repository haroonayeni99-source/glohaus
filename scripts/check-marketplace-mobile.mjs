// Actual navigation components, public category labels, isolated browser/data.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/marketplace-navigation-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const chrome = await chromium.launch({ executablePath: process.env.GLOHAUS_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const safari = await webkit.launch();
const results = [];
try {
  for (const [name, browser, profile] of [["iphone", safari, devices["iPhone 13"]], ["android", chrome, devices["Pixel 7"]], ["small-android", chrome, { ...devices["Pixel 7"], viewport: { width: 320, height: 760 } }], ["desktop", chrome, { viewport: { width: 1440, height: 1000 } }]]) {
    for (const theme of ["light", "night"]) {
      const page = await browser.newPage(profile);
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
      const rail = page.locator(".marketplace-sidebar");
      await expect(rail.getByRole("link", { name: "Professional skincare essentials", exact: true })).toBeAttached();
      if (name !== "desktop") {
        expect(await rail.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        const checkSpacing = async () => {
          const boxes = await rail.locator("a").evaluateAll(els => els.filter(el => el.getBoundingClientRect().width).map(el => {
            const r = el.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(el);
            return { left: r.left, right: r.right, textRight: range.getBoundingClientRect().right };
          }));
          for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right);
          for (const box of boxes) expect(box.textRight).toBeLessThanOrEqual(box.right + 1);
        };
        await checkSpacing();
        await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await checkSpacing();
        const gift = rail.getByRole("link", { name: "Gift sets", exact: true });
        const box = await gift.boundingBox(), track = await rail.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(track.x);
        expect(box.x + box.width).toBeLessThanOrEqual(track.x + track.width + 1);
        await expect(gift).toHaveAttribute("href", /q=Gift/);
        // Every rendered text line must stay out of its card's arrow lane.
        const collisions = await page.locator(".marketplace-category").evaluateAll(cards => cards.flatMap(card => {
          const arrow = card.querySelector("i").getBoundingClientRect();
          return [...card.querySelectorAll("strong,small")].flatMap(el => {
            const range = document.createRange(); range.selectNodeContents(el);
            return [...range.getClientRects()].filter(r => r.right > arrow.left && r.left < arrow.right && r.bottom > arrow.top && r.top < arrow.bottom).map(() => el.textContent);
          });
        }));
        expect(collisions).toEqual([]);
        const strip = page.locator(".marketplace-category-strip");
        await strip.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        const last = strip.locator("a").last();
        const lastBox = await last.boundingBox(), stripBox = await strip.boundingBox();
        expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      } else {
        expect(await rail.locator("nav").first().evaluate(el => getComputedStyle(el).display)).toBe("grid");
      }
      await page.screenshot({ path: `reports/marketplace-${name}-${theme}.png`, fullPage: false });
      results.push({ name, theme, passed: true });
      await page.close();
    }
  }
  await writeFile("reports/marketplace-mobile-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await Promise.all([chrome.close(), safari.close()]);
  await new Promise(resolve => server.close(resolve));
}
