// Real components with isolated records and intercepted APIs/tiles. No live mutations.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
const streetTile = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5e9dd"/><path d="M0 90H256M110 0V256" stroke="white" stroke-width="12"/></svg>',
  ),
)
  .png()
  .toBuffer();
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/discovery-map.tsx";
const { server } = await import("./ui-audit.mjs");
const browserOptions = {
  executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
};
let browser = await chromium.launch(browserOptions);
const results = [];
try {
  for (const theme of process.env.GLOHAUS_MAP_THEME
    ? [process.env.GLOHAUS_MAP_THEME]
    : ["light", "night"])
    for (const width of process.env.GLOHAUS_MAP_WIDTH
      ? [Number(process.env.GLOHAUS_MAP_WIDTH)]
      : [320, 390, 820, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await context.route("https://tile.openstreetmap.org/**", (r) =>
        r.fulfill({
          contentType: "image/png",
          headers: { "access-control-allow-origin": "*" },
          body: streetTile,
        }),
      );
      await page.route("**/api/media/**", (r) =>
        r.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c5b3a0"/><circle cx="150" cy="145" r="70" fill="#735d4e"/><path d="M40 400Q150 150 260 400" fill="#857363"/></svg>',
        }),
      );
      const go = (path) =>
        page.goto(`http://127.0.0.1:3004${path}?theme=${theme}`);
      await go("/explore");
      await expect(
        page.getByRole("heading", {
          name: "Find Beauty Professionals Near You",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Hair", exact: true }),
      ).toHaveAttribute("href", /categoryId=11111111/);
      const directions = page.getByRole("link", {
        name: "Directions to Brixton Braids in Google Maps",
        exact: true,
      });
      await expect(directions).toHaveAttribute(
        "href",
        "https://www.google.com/maps/dir/?api=1&destination=51.462%2C-0.115&dir_action=navigate",
      );
      await expect(
        page.getByRole("link", {
          name: "Directions to Area Studio in Google Maps",
          exact: true,
        }),
      ).toHaveCount(0);
      const firstCard = page.locator(".discovery-card").first();
      const serviceLink = firstCard.locator(".matching-services a").first();
      await serviceLink.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect(firstCard).not.toHaveClass(/is-selected/);
      const restingLink = await serviceLink.boundingBox();
      await serviceLink.hover();
      await expect(firstCard).toHaveClass(/is-selected/);
      const hoveredLink = await serviceLink.boundingBox();
      expect(hoveredLink).toEqual(restingLink);
      await page.mouse.move(0, 0);
      await serviceLink.focus();
      expect(await serviceLink.boundingBox()).toEqual(restingLink);
      await page
        .getByRole("button", { name: "Save Brixton Braids", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Unsave Brixton Braids",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expect(
        page.getByRole("button", {
          name: "Unsave Brixton Braids",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await page
        .locator(".discovery-card")
        .first()
        .getByRole("button", { name: "Quick View", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("link", { name: /Directions to Brixton Braids/ }),
      ).toHaveAttribute("href", /destination=51.462%2C-0.115/);
      await expect(
        page.getByRole("dialog").locator("video[controls]"),
      ).toHaveCount(1);
      await expect(
        page.getByRole("dialog").getByRole("link", { name: /Knotless Braids/ }),
      ).toHaveAttribute("href", /service=33333333/);
      await page.getByRole("button", { name: "Close quick view" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const borough = page.getByRole("combobox", {
        name: "London borough",
        exact: true,
      });
      await expect(borough.locator("option")).toHaveCount(33);
      await expect(
        page
          .getByRole("navigation", { name: "Explore London areas" })
          .getByRole("link"),
      ).toHaveCount(33);
      await expect(
        page
          .getByRole("navigation", { name: "Explore London areas" })
          .getByRole("link", {
            name: "Southwark Explore the borough",
            exact: true,
          }),
      ).toHaveAttribute("href", /location=Southwark/);
      await expect(
        page.getByRole("button", {
          name: "Show Area Studio on map",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.locator(".london-overview")).toHaveCount(1);
      if (width <= 900)
        await page.getByRole("button", { name: "Map", exact: true }).click();
      await page.screenshot({
        path: `reports/london-overview-${theme}-${width}.png`,
        fullPage: true,
      });
      if (width <= 900)
        await page.getByRole("button", { name: "List", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Show Brixton Braids on map",
          exact: true,
        })
        .click();
      await expect(page.locator(".london-overview")).toHaveCount(0);
      if (width <= 900)
        await expect(
          page.getByRole("button", { name: "Map", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      await page
        .getByRole("button", { name: "Load street map", exact: true })
        .click();
      await expect(page.locator(".geo-map-surface")).toHaveAttribute(
        "data-center-latitude",
        "51.462",
      );
      await expect(page.locator(".geo-map-surface")).toHaveAttribute(
        "data-center-longitude",
        "-0.115",
      );
      await expect(page.locator(".geo-map-surface")).toHaveAttribute(
        "data-zoom",
        "16",
      );
      const pin = page.getByRole("button", {
        name: "Brixton Braids, from £45.00",
        exact: true,
      });
      await expect(pin).toBeVisible();
      await pin.click();
      await expect(page.locator(".discovery-pin-card")).toContainText(
        "Knotless Braids",
      );
      await expect(
        page
          .locator(".discovery-pin-card")
          .getByRole("link", { name: /Directions to Brixton Braids/ }),
      ).toHaveAttribute("href", /destination=51.462%2C-0.115/);
      if (width > 900) {
        const list = await page.locator(".map-pro-results").boundingBox(),
          map = await page.locator(".discovery-map-panel").boundingBox();
        expect(map.x + map.width).toBeLessThanOrEqual(list.x + 2);
        expect(list.width).toBeCloseTo(420, -1);
      }
      await page.getByRole("button", { name: "Close map selection" }).click();
      await page.getByRole("button", { name: "Move street map right" }).click();
      await page.getByRole("button", { name: "Search this area" }).click();
      await expect(page.getByRole("status")).toContainText("matching");
      await expect(page.locator(".discovery-map-help")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `reports/discovery-map-${theme}-${width}.png`,
        fullPage: true,
      });
      await go("/admin/product-categories");
      await page
        .getByRole("button", { name: "Add category", exact: true })
        .click();
      await page.getByLabel("Category name", { exact: true }).fill("Aftercare");
      await page
        .getByRole("button", { name: "Create category", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "added" }),
      ).toContainText("Aftercare");
      await expect(
        page.getByRole("heading", { name: "Aftercare", exact: true }),
      ).toBeVisible();
      const added = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("discovery-categories")).find(
          (c) => c.name === "Aftercare",
        ),
      );
      expect(added.active).toBe(true);
      await page
        .getByRole("button", { name: "Edit Aftercare", exact: true })
        .click();
      await page
        .getByLabel("Category name", { exact: true })
        .fill("Aftercare kits");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Aftercare kits", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Hide Aftercare kits", exact: true })
        .click();
      await page.reload();
      await expect(
        page.locator(".category-row").filter({ hasText: "Aftercare kits" }),
      ).toContainText("Hidden");
      await page
        .getByRole("button", { name: "Show Aftercare kits", exact: true })
        .click();
      await expect(
        page.locator(".category-row").filter({ hasText: "Aftercare kits" }),
      ).toContainText("Visible");
      await go("/professional/products");
      await page
        .getByLabel("Product name", { exact: true })
        .fill("Aftercare balm");
      await page
        .getByLabel("Product category", { exact: true })
        .selectOption(added.id);
      await page.getByLabel("Price (£)", { exact: true }).fill("12.00");
      await page.getByLabel("Stock", { exact: true }).fill("4");
      await page
        .getByRole("button", { name: "Create product", exact: true })
        .click();
      await expect(
        page.getByText("Product saved.", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("discovery-last-request")).body
              .categoryId,
        ),
      ).toBe(added.id);
      expect(errors).toEqual([]);
      results.push({
        theme,
        width,
        passed: true,
        checks: [
          "dynamic category links",
          "service links stay in place on hover and focus",
          "save persists",
          "public media quick view",
          "real price pin selection",
          "original map-first layout",
          "all 32 boroughs",
          "selected professional centred at street zoom",
          "viewport search",
          "no overflow",
          "admin adds edits hides and restores categories",
          "seller assigns category",
        ],
      });
      await context.close();
      // Release GPU/worker resources between software-rendered viewport cases.
      await browser.close();
      browser = await chromium.launch(browserOptions);
      console.log(`Verified ${theme} ${width}px`);
    }
  await writeFile(
    "reports/discovery-map-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .screenshot({
          path: "reports/discovery-map-failed.png",
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
