// Actual preference control and styles; isolated storage, no emails or live data.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/marketing-preferences-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch();
const results = [];
try {
  for (const role of ["customer", "professional"])
    for (const theme of ["light", "night"])
      for (const width of [390, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
          route.abort(),
        );
        await page.goto(`http://127.0.0.1:3004/?role=${role}&theme=${theme}`);
        const offers = page.getByRole("checkbox", {
          name: "Offers & promotions",
          exact: true,
        });
        await expect(offers).toBeChecked();
        if (role === "professional")
          await expect(
            page.getByRole("checkbox", {
              name: "GLOHAUS growth tips",
              exact: true,
            }),
          ).toBeChecked();
        await offers.uncheck();
        await expect(page.getByRole("status")).toHaveText(
          "Marketing preferences saved.",
        );
        await expect(offers).not.toBeChecked();
        await page.reload();
        await expect(offers).not.toBeChecked();
        // Clicking the whole row and using the keyboard both operate the checkbox.
        await page.locator('label[for="marketing-customerOffers"]').click();
        await expect(page.getByRole("status")).toHaveText(
          "Marketing preferences saved.",
        );
        await expect(offers).toBeChecked();
        await offers.focus();
        await page.keyboard.press("Space");
        await expect(page.getByRole("status")).toHaveText(
          "Marketing preferences saved.",
        );
        await expect(offers).not.toBeChecked();
        await page.evaluate(() =>
          sessionStorage.setItem("fail-save", "UNAVAILABLE"),
        );
        await offers.check();
        await expect(page.getByRole("status")).toContainText(
          "previous choices have been restored",
        );
        await expect(offers).not.toBeChecked();
        await expect(offers).toBeEnabled();
        await offers.check();
        await expect(page.getByRole("status")).toHaveText(
          "Marketing preferences saved.",
        );
        const body = JSON.parse(
          await page.evaluate(() => sessionStorage.getItem("last-request")),
        );
        expect(Object.keys(body)).toHaveLength(12);
        expect(body).not.toHaveProperty("unsubscribe_token");
        expect(body).not.toHaveProperty("updated_at");
        await page
          .getByRole("button", {
            name: "Unsubscribe from all optional marketing",
          })
          .click();
        await expect(page.getByRole("status")).toHaveText(
          "Marketing preferences saved.",
        );
        await page.reload();
        expect(
          await page
            .getByRole("checkbox")
            .evaluateAll((inputs) => inputs.every((input) => !input.checked)),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
        await page.screenshot({
          path: `reports/marketing-preferences-${role}-${theme}-${width}.png`,
          fullPage: true,
        });
        results.push({
          role,
          theme,
          width,
          savedChoicesReload: true,
          labelAndKeyboard: true,
          failureRollbackRetry: true,
          unsubscribeAll: true,
          errors,
        });
        await page.close();
      }
  await writeFile(
    "reports/marketing-preferences-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
