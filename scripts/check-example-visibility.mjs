// Isolated Owner UI with mocked HTTP persistence; database permissions and
// real route validation are tested separately. No production mutations.
import { chromium, webkit, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/example-visibility-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const results = [];
try {
  for (const [engine, launcher] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await launcher.launch(
      engine === "chromium"
        ? {
            executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined,
            args: ["--no-sandbox"],
          }
        : {},
    );
    try {
      for (const theme of ["light", "night"])
        for (const width of [320, 390, 1440]) {
          const context = await browser.newContext({
              viewport: { width, height: 1000 },
            }),
            page = await context.newPage(),
            errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await context.route(
            "**/images/profile-examples/*.svg",
            async (route) =>
              route.fulfill({
                contentType: "image/svg+xml",
                body: await readFile(
                  "public/images/profile-examples/" +
                    basename(new URL(route.request().url()).pathname),
                ),
              }),
          );
          const open = async () => {
            await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
            await page.addStyleTag({
              content: await readFile(
                "src/components/profile-examples.css",
                "utf8",
              ),
            });
          };
          await open();
          const cards = page.locator(".example-discovery-card");
          await expect(cards).toHaveCount(10);
          const master = page.getByRole("checkbox", {
              name: "Show example profiles on the live website",
            }),
            gloss = page.getByRole("checkbox", {
              name: "Gloss House Nails",
              exact: true,
            }),
            save = page.getByRole("button", {
              name: "Save example visibility",
              exact: true,
            });
          await gloss.uncheck();
          await expect(cards).toHaveCount(10);
          await save.click();
          await expect(cards).toHaveCount(9);
          await open();
          await expect(gloss).not.toBeChecked();
          await expect(cards).toHaveCount(9);
          await master.uncheck();
          await save.click();
          await expect(cards).toHaveCount(0);
          await expect(page.getByRole("status")).toContainText(
            "All example profiles are hidden",
          );
          await open();
          await expect(master).not.toBeChecked();
          await expect(cards).toHaveCount(0);
          await master.check();
          await save.click();
          await expect(cards).toHaveCount(9);
          await gloss.check();
          await save.click();
          await expect(cards).toHaveCount(10);
          await page.evaluate(() =>
            sessionStorage.setItem("example-failure", "UNAVAILABLE"),
          );
          await master.uncheck();
          await save.click();
          await expect(page.getByRole("status")).toContainText(
            "could not be saved",
          );
          await expect(cards).toHaveCount(10);
          await open();
          await expect(master).toBeChecked();
          await page.evaluate(() =>
            sessionStorage.setItem("example-failure", "MFA_REQUIRED"),
          );
          await master.uncheck();
          await save.click();
          await expect(page.getByRole("status")).toContainText(
            "security verification has expired",
          );
          await expect(cards).toHaveCount(10);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(errors).toEqual([]);
          await page.screenshot({
            path: `reports/profile-examples-owner-${engine}-${theme}-${width}.png`,
            fullPage: true,
          });
          results.push({ engine, theme, width, passed: true });
          await context.close();
        }
    } catch (error) {
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          await page
            .screenshot({
              path: `reports/profile-examples-owner-failed-${engine}.png`,
              fullPage: true,
            })
            .catch(() => {});
        }
      throw error;
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    "reports/profile-examples-visibility-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({ ownerVisibilityCases: results.length, allPassed: true }),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
