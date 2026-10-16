// Real components, fictional public pins and mocked geocoding/tiles/mutations only.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
const streetTile = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7eadf"/><path d="M0 100 H256 M90 0 V256" stroke="#fff" stroke-width="8"/></svg>',
  ),
)
  .png()
  .toBuffer();
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/location-entry.tsx";
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
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
try {
  for (const theme of ["light", "night"])
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        geolocation: { latitude: 51.5074, longitude: -0.1278, accuracy: 20 },
        permissions: ["geolocation"],
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("https://tile.openstreetmap.org/**", (route) =>
        route.fulfill({
          contentType: "image/png",
          headers: { "access-control-allow-origin": "*" },
          body: streetTile,
        }),
      );
      const go = (path) =>
        page.goto(
          `http://127.0.0.1:3004${path}${path.includes("?") ? "&" : "?"}theme=${theme}`,
        );
      await go("/professional/profile");
      const publish = page.getByRole("button", {
        name: "Publish public pin",
        exact: true,
      });
      await expect(publish).toBeDisabled();
      await page.getByLabel("Business postcode").fill("SW1A 1AA");
      await page.getByRole("button", { name: "Find postcode area" }).click();
      await expect(page.getByRole("status")).toContainText("area centre");
      await expect(publish).toBeDisabled();
      await page.getByRole("button", { name: "Load street map" }).click();
      await page.getByRole("button", { name: "Use pin at map centre" }).click();
      await expect(publish).toBeDisabled();
      await page.getByRole("checkbox").check();
      await publish.click();
      await expect(page.getByRole("status")).toContainText(
        "Public business pin saved",
      );
      const requests = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("location-requests")),
      );
      const body = JSON.parse(requests.find((r) => r.method === "PUT").body);
      expect(body).toMatchObject({
        confirmed: true,
        source: "pin",
        latitude: 51.501,
        longitude: -0.141,
      });
      await noOverflow(page);
      await page.getByRole("button", { name: "Remove public pin" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Public pin removed",
      );
      await expect(publish).toBeDisabled();
      await page
        .getByRole("button", { name: "Use my location at the studio" })
        .click();
      await expect(page.getByRole("status")).toContainText("Pin selected");
      await expect(publish).toBeDisabled();
      await page.getByRole("checkbox").check();
      await publish.click();
      await expect(page.getByRole("status")).toContainText("saved");
      await go("/professional/profile?loadFailure=1");
      await expect(page.getByRole("status")).toContainText("Could not load");
      await page
        .getByRole("button", { name: "Retry loading public pin" })
        .click();
      await expect(page.getByRole("status")).toContainText("No public pin yet");
      await go("/explore");
      await expect(
        page.getByText("London · Area only", { exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "2 matching professionals",
      );
      await expect(
        page.getByText("London · Less than 0.1 miles away"),
      ).toBeVisible();
      await expect(
        page.getByText("Area Only Studio", { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Distance radius").selectOption("1");
      await expect(page.getByRole("status")).toContainText(
        "1 matching professional",
      );
      await expect(
        page.getByText("Further Studio", { exact: true }),
      ).toHaveCount(0);
      expect(page.url()).not.toContain("51.5074");
      if (width <= 900)
        await page.getByRole("button", { name: "Map", exact: true }).click();
      await page.getByRole("button", { name: "Load street map" }).click();
      await expect(
        page.getByRole("button", { name: "Nearby Studio", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Zoom in street map" }).click();
      await page.getByRole("button", { name: "Move street map right" }).click();
      await page.getByRole("button", { name: "Reset map" }).click();
      await expect(page.getByText("OpenStreetMap contributors")).toBeVisible();
      await noOverflow(page);
      await page.getByRole("button", { name: "Clear my location" }).click();
      await expect(page.getByRole("status")).toContainText("Location cleared");
      if (width <= 900)
        await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(
        page.getByText("Area Only Studio", { exact: true }),
      ).toBeVisible();
      await go("/explore?failure=1");
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Nearby search is unavailable",
      );
      await expect(
        page.getByText("Area Only Studio", { exact: true }),
      ).toBeVisible();
      await go("/explore?slow=1");
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .click();
      await page.getByRole("button", { name: "Clear my location" }).click();
      await page.waitForTimeout(350);
      await expect(page.getByRole("status")).toContainText("Location cleared");
      await expect(
        page.getByText("Area Only Studio", { exact: true }),
      ).toBeVisible();
      await context.setGeolocation({
        latitude: 51.5074,
        longitude: -0.1278,
        accuracy: 3000,
      });
      await go("/explore");
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("too approximate");
      await expect(
        page.getByText("Area Only Studio", { exact: true }),
      ).toBeVisible();
      await context.clearPermissions();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "geolocation", {
          value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
        });
      });
      await go("/explore");
      await page
        .getByRole("button", { name: "Use my location", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "permission was not granted",
      );
      expect(errors).toEqual([]);
      results.push({ theme, width, status: "passed" });
      await context.close();
    }
  await writeFile(
    "reports/location-journeys.json",
    JSON.stringify({ cases: results.length, results }, null, 2),
  );
  console.log(
    `Verified ${results.length} location journeys in both themes and four widths.`,
  );
} finally {
  await browser.close();
  server.close();
}
