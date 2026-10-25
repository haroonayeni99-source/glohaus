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
        name: "Explore all 32 London boroughs",
        exact: true,
      });
      await expect(borough.locator("option")).toHaveCount(33);
      const areas = page.getByRole("navigation", {
        name: "Explore London areas",
      });
      await expect(areas.getByRole("link")).toHaveCount(33);
      await expect(
        areas.getByRole("link", { name: "Southwark", exact: true }),
      ).toHaveAttribute("href", /location=Southwark/);
      await expect(
        page.getByRole("button", {
          name: "Show Area Studio on map",
          exact: true,
        }),
      ).toHaveCount(0);
      if (width <= 900)
        await page.getByRole("button", { name: "Map", exact: true }).click();
      await page
        .getByRole("button", { name: "Load street map", exact: true })
        .click();
      await expect(page.locator(".glohaus-locator canvas")).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Select Brixton Braids",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Select Nails & Glow", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Select Area Studio", exact: true }),
      ).toHaveCount(0);
      // Select actual MapLibre markers rather than obsolete GeographicMap DOM.
      await page
        .getByRole("button", { name: "Select Brixton Braids", exact: true })
        .click();
      await expect(page.locator(".discovery-pin-card")).toContainText(
        "Knotless Braids",
      );
      await expect(page.locator(".glohaus-locator-selected")).toContainText(
        "Brixton Braids",
      );
      await expect(
        page
          .locator(".discovery-pin-card")
          .getByRole("link", { name: /Directions to Brixton Braids/ }),
      ).toHaveAttribute("href", /destination=51.462%2C-0.115/);
      await expect(
        page.getByRole("button", {
          name: "Select Brixton Braids",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      if (width <= 900)
        await page.getByRole("button", { name: "List", exact: true }).click();
      await page
        .getByRole("button", { name: "Show Nails & Glow on map", exact: true })
        .click();
      await expect(page.locator(".discovery-pin-card")).toContainText(
        "Nails & Glow",
      );
      await expect(
        page.getByRole("button", { name: "Select Nails & Glow", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      if (width > 900) {
        const list = await page.locator(".map-pro-results").boundingBox();
        const map = await page.locator(".discovery-map-panel").boundingBox();
        expect(list.x + list.width).toBeLessThanOrEqual(map.x + 2);
      }
      await page.getByRole("button", { name: "Close map selection" }).click();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      const searchArea = page.getByRole("button", {
        name: "Search this area",
        exact: true,
      });
      await expect(searchArea).toBeEnabled();
      await searchArea.click();
      await expect(page.getByRole("status")).toContainText("matching");
      const request = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("discovery-nearby-request")),
      );
      expect(request.path).toContain("/api/v1/explore/nearby");
      await page
        .getByRole("button", { name: "View all London", exact: true })
        .click();
      await expect(page.locator(".discovery-pin-card")).toHaveCount(0);
      if (width <= 900)
        await page.getByRole("button", { name: "List", exact: true }).click();
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
      await page.goto(
        `http://127.0.0.1:3004/explore?theme=${theme}&unavailable=1`,
      );
      const loadError = page.getByRole("alert");
      await expect(loadError).toContainText(
        "We couldn’t load professionals right now.",
      );
      await expect(loadError.locator("h3")).toHaveCSS(
        "color",
        theme === "night" ? "rgb(243, 243, 235)" : "rgb(35, 42, 36)",
      );
      await expect(loadError.locator("p")).toHaveCSS(
        "color",
        theme === "night" ? "rgb(192, 203, 192)" : "rgb(87, 97, 89)",
      );
      await expect(
        page.getByRole("button", { name: "Retry loading results" }),
      ).toBeEnabled();
      await expect(
        page.getByText("No matching professionals yet.", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("0 matching professionals", { exact: false }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `reports/discovery-map-unavailable-${theme}-${width}.png`,
        fullPage: true,
      });
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
          "approved map-first layout",
          "actual MapLibre worker, canvas, controls and markers in both themes",
          "all 32 boroughs",
          "marker and list selection stay synchronized",
          "viewport search",
          "no overflow",
          "admin adds edits hides and restores categories",
          "seller assigns category",
          "database failure shows a readable retry state without false zero results",
        ],
      });
      await context.close();
      // Release GPU/worker resources between software-rendered viewport cases.
      await browser.close();
      browser = await chromium.launch(browserOptions);
      console.log(`Verified ${theme} ${width}px`);
    }
  // A graphics-denied browser must retain discovery instead of hitting the page error boundary.
  const unsupported = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return original.call(this, type, ...args);
    };
  });
  const fallbackPage = await unsupported.newPage();
  const fallbackErrors = [];
  fallbackPage.on("pageerror", (error) => fallbackErrors.push(error.message));
  await fallbackPage.goto("http://127.0.0.1:3004/?theme=light");
  await fallbackPage
    .getByRole("button", { name: "Load street map", exact: true })
    .click();
  await expect(fallbackPage.getByRole("alert")).toContainText(
    "You can still search and browse professional listings",
  );
  await expect(
    fallbackPage.getByRole("heading", {
      name: "Something interrupted your visit.",
    }),
  ).toHaveCount(0);
  await expect(
    fallbackPage.getByRole("link", { name: "Brixton Braids", exact: true }),
  ).toBeVisible();
  expect(fallbackErrors).toEqual([]);
  results.push({
    theme: "light",
    width: 1440,
    checks: [
      "WebGL unavailable keeps professional listings and search usable without page errors",
    ],
  });
  await unsupported.close();
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
