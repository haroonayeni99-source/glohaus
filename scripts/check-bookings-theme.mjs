import { chromium, expect } from "@playwright/test";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/bookings-theme-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
const results = [];
try {
  for (const theme of ["light", "night"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
    const links = page.getByRole("navigation", { name: "Appointment views" }).getByRole("link");
    await expect(links).toHaveCount(3);
    await expect(links.first()).toHaveAttribute("aria-current", "page");
    const selectors = [".booking-view-tabs a", ".appointment-card h3", ".appointment-card p", ".appointment-time", ".appointment-detail-label", ".appointment-date strong", ".catalog-empty h2", ".catalog-empty p"];
    for (const selector of selectors) {
      for (const element of await page.locator(selector).all()) {
        await expect(element).toBeVisible();
        const ratio = await element.evaluate(el => {
          const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
          const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          let ancestor = el;
          while (ancestor && getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)") ancestor = ancestor.parentElement;
          const foreground = luminance(getComputedStyle(el).color);
          const background = luminance(getComputedStyle(ancestor).backgroundColor);
          return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        });
        expect(ratio, `${theme} ${width} ${selector}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/bookings-${theme}-${width}.png`, fullPage: true });
    results.push({theme, width, contrast: "AA", overflow: false});
    await page.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
