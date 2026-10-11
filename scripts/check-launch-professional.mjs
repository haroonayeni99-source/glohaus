// Real customer/professional components; mocked provider responses, no production data.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/mobile-audit/entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({
  executablePath: process.env.GLOHAUS_TEST_BROWSER,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
const image = {
  name: "photo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
    "base64",
  ),
};
try {
  for (const theme of ["light", "night"])
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
        route.abort(),
      );
      const go = (path) =>
        page.goto(
          `http://127.0.0.1:3004${path}${path.includes("?") ? "&" : "?"}theme=${theme}&journey=1`,
        );
      await go("/professional");
      await expect(
        page.getByRole("progressbar", { name: "Profile completion" }),
      ).toHaveAttribute("value", "3");
      await expect(
        page.getByRole("link", { name: "Set your working hours", exact: true }),
      ).toHaveAttribute("href", "/professional/availability");
      await go("/professional/services");
      await page.getByLabel("Find a service").fill("missing-service");
      await expect(
        page.getByText(
          "No services match. Clear your search or change the status filter.",
        ),
      ).toBeVisible();
      await page.getByLabel("Find a service").fill("");
      await page
        .locator(".service-edit-list button")
        .filter({ hasText: /^Edit$/ })
        .first()
        .click();
      await expect(
        page.locator('#service-editor-form input[name="name"]'),
      ).toBeFocused();
      await page
        .locator('#service-editor-form input[name="name"]')
        .fill("Updated signature service");
      await page.getByLabel("Fixed deposit (£)", { exact: true }).fill("10");
      await page
        .getByRole("button", { name: "Save service", exact: true })
        .click();
      await expect(
        page.getByText("Saved successfully.", { exact: true }),
      ).toBeVisible();
      await go("/professional/availability");
      await page
        .getByRole("button", { name: "Next month", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Back to today", exact: true })
        .click();
      await expect(
        page.locator('.calendar-grid [aria-current="date"]'),
      ).toHaveAttribute("aria-pressed", "true");
      await page
        .getByRole("button", { name: "Weekly hours", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save working hours", exact: true })
        .click();
      await expect(
        page.getByText("Your working hours have been saved."),
      ).toBeVisible();
      await go("/professional/portfolio");
      await page.getByLabel("Photo or video").setInputFiles(image);
      await expect(
        page.getByRole("img", { name: "Selected upload preview" }),
      ).toBeVisible();
      await page.getByLabel("Describe your work").fill("Signature beauty look");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Upload media", exact: true })
        .click();
      await expect(
        page.getByText(
          "Uploaded privately. Publish it when you are ready to show it on GLOHAUS.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("img", { name: "Selected upload preview" }),
      ).toHaveCount(0);
      await page.getByLabel("Find portfolio media").fill("missing");
      await expect(
        page.getByText(
          "No media matches. Clear your search or change the visibility filter.",
        ),
      ).toBeVisible();
      await go("/professional/profile");
      await page
        .getByRole("button", {
          name: "Check remaining requirements",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("individual verification document", { exact: true }),
      ).toBeVisible();
      await go("/explore?location=Brixton&category=Nails");
      await expect(page.locator(".map-area-card.active")).toContainText(
        "Brixton",
      );
      await expect(page.locator(".map-service-filters .active")).toContainText(
        "Nails",
      );
      const href = await page
        .locator(".map-service-filters a")
        .filter({ hasText: /^Hair$/ })
        .getAttribute("href");
      expect(href).toContain("location=Brixton");
      expect(href).toContain("category=Hair");
      for (const invalid of ["zero", "high"]) {
        await go(`/p/fictional-studio?invalidDeposit=${invalid}`);
        await expect(
          page.getByText("Service setup needs attention", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Find another professional" }),
        ).toHaveAttribute("href", "/explore");
        await page.locator(".booking-date-strip button").nth(1).click();
        await page.locator(".booking-times button").first().click();
        await expect(
          page.getByRole("button", { name: "Continue", exact: true }),
        ).toBeDisabled();
        expect(
          await page.evaluate(() =>
            JSON.parse(sessionStorage.getItem("mobile-requests") || "[]").some(
              (request) =>
                request.url === "/api/v1/bookings" && request.method === "POST",
            ),
          ),
        ).toBe(false);
      }
      await go("/p/fictional-studio");
      await page.locator(".booking-date-strip button").nth(1).click();
      await page.locator(".booking-times button").first().click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".booking-pay-button")).toBeDisabled();
      await page
        .locator(
          ".booking-widget .policy-check input, .booking-editor .policy-check input, #booking .policy-check input",
        )
        .check();
      await page.locator(".booking-pay-button").click();
      await expect(page).toHaveURL(/\/account\/bookings\//);
      await go("/customer/review");
      await page.locator('[name="publicName"]').fill("Alex");
      await page
        .locator('[name="body"]')
        .fill("A lovely appointment with thoughtful professional service.");
      await page
        .getByRole("button", { name: "Publish review", exact: true })
        .click();
      await expect(
        page.getByText(
          "Your review has been published. Thank you for sharing your experience.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Review published", exact: true }),
      ).toBeDisabled();
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      results.push({
        theme,
        width,
        providerMode: "isolated fixtures",
        flows: [
          "setup",
          "services",
          "calendar",
          "portfolio",
          "verification",
          "combined discovery",
          "booking",
          "invalid deposit guidance",
          "review",
        ],
        errors,
      });
      console.log(
        `${theme} ${width}: professional and customer controls passed`,
      );
      await page.close();
    }
  await writeFile(
    "reports/launch-professional-results.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
  server.close();
}
