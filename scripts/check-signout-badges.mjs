import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/signout-badges-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
const results = [];
try {
  for (const theme of ["light", "night"]) for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
    for (const context of ["standard", "admin", "mobile"]) {
      const button = page.getByTestId(context).getByRole("button", { name: "Sign out", exact: true });
      await expect(button).toBeVisible();
      const style = await button.evaluate(el => { const s = getComputedStyle(el); return { radius: s.borderRadius, decoration: s.textDecorationLine, height: el.getBoundingClientRect().height }; });
      expect(style.radius).toBe("999px"); expect(style.decoration).toBe("none"); expect(style.height).toBeGreaterThanOrEqual(38);
    }
    const cards = page.locator(".professional-card");
    await expect(cards.nth(0).locator(".verification-crest")).toHaveCount(3);
    await expect(cards.nth(1).locator(".verification-crest")).toHaveCount(1);
    await expect(cards.nth(2).locator(".verification-crest")).toHaveCount(0);
    await expect(cards.nth(2).getByText("Account restricted")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `reports/signout-badges-${theme}-${width}.png`, fullPage: true });
    results.push({ theme, width, passed: true }); await page.close();
  }
  await writeFile("reports/signout-badges-results.json", JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
