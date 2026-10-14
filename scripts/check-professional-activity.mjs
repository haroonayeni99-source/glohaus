// Actual interface components, fictional local data and intercepted mutations.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/professional-activity.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({
  executablePath: process.env.GLOHAUS_TEST_BROWSER,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
try {
  for (const role of ["owner", "admin", "professional"])
    for (const theme of ["light", "night"])
      for (const width of [320, 390, 820, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
          route.abort(),
        );
        await page.goto(
          `http://127.0.0.1:3004/activity?role=${role}&theme=${theme}#professional-activity`,
        );
        const panel = page.locator(".professional-activity-panel");
        await expect(panel).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: `reports/activity-${role}-${theme}-${width}.png`,
          fullPage: true,
        });
        if (role === "owner") {
          await page
            .getByLabel("Reason for the next decision")
            .fill("Reviewed the professional inactivity and warning.");
          const cards = page.locator(".activity-card");
          await expect(
            cards
              .nth(0)
              .getByRole("button", {
                name: "Hide from discovery",
                exact: true,
              }),
          ).toBeDisabled();
          await cards
            .nth(0)
            .getByRole("button", { name: "Offer seven-day boost", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog).toContainText("Maya Beauty Studio");
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(1);
          await page.screenshot({
            path: `reports/activity-confirm-${theme}-${width}.png`,
          });
          await dialog.getByRole("button", { name: "Cancel decision" }).click();
          expect(
            await page.evaluate(() =>
              JSON.parse(sessionStorage.getItem("activity-fixture-requests")),
            ),
          ).toEqual([]);
          await cards
            .nth(1)
            .getByRole("button", { name: "Hide from discovery", exact: true })
            .click();
          await dialog
            .getByRole("button", { name: "Confirm decision" })
            .click();
          await expect(cards.nth(1)).toContainText("Hidden from discovery");
          await page
            .getByLabel("Reason for the next decision")
            .fill("Professional returned and Owner reviewed restoration.");
          await cards
            .nth(1)
            .getByRole("button", {
              name: "Restore discovery visibility",
              exact: true,
            })
            .click();
          await dialog
            .getByRole("button", { name: "Confirm decision" })
            .click();
          await expect(cards.nth(1)).toContainText("Profile: published");
          const requests = await page.evaluate(() =>
            JSON.parse(sessionStorage.getItem("activity-fixture-requests")),
          );
          expect(requests.map((request) => request.action)).toEqual([
            "hide",
            "restore",
          ]);
          expect(
            requests.every(
              (request) =>
                request.confirmed &&
                request.professionalId ===
                  "22222222-2222-4222-8222-222222222222",
            ),
          ).toBe(true);
        } else if (role === "admin") {
          await expect(panel).toContainText("Read-only view");
          await expect(
            panel.getByRole("button", { name: "Hide from discovery" }),
          ).toHaveCount(0);
        } else {
          const start = panel.getByRole("button", {
            name: "Start my seven-day boost",
          });
          await expect(start).toBeDisabled();
          await panel.getByRole("checkbox").check();
          await start.click();
          await expect(panel).toContainText("21 Oct 2026");
          expect(
            await page.evaluate(() =>
              JSON.parse(sessionStorage.getItem("activity-fixture-requests")),
            ),
          ).toEqual([{ action: "accept_boost", confirmed: true }]);
        }
        expect(errors).toEqual([]);
        results.push({ role, theme, width, errors });
        await page.close();
      }
  await writeFile(
    "reports/activity-browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(`${results.length} activity browser cases passed`);
} finally {
  await browser.close();
  server.close();
}
