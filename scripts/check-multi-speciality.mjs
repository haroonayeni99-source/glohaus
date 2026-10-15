import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/multi-speciality-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch();
const results = [];
const photo = await readFile("public/images/categories/hair-v2.webp");
const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
try {
  for (const width of [320, 390, 1440])
    for (const theme of ["light", "night"]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.route(
        /\/api\/media\/|\/images\/|^https?:\/\/(?!127\.0\.0\.1)/,
        (route) =>
          route.request().resourceType() === "image"
            ? route.fulfill({ contentType: "image/webp", body: photo })
            : route.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        `http://127.0.0.1:3004/professional/services?theme=${theme}`,
      );
      await expect(
        page.getByRole("heading", { name: "Your categories & specialities" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save specialities", exact: true })
        .click();
      expect(
        await page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem("taxonomy-requests")).at(-1).body
              .specialityIds,
        ),
      ).toEqual([id(3), id(4)]);
      const form = page.locator("#service-editor-form");
      await form.locator('[name="categoryId"]').selectOption(id(1));
      await form.locator('[name="specialityId"]').selectOption(id(4));
      await form.locator('[name="templateId"]').selectOption(id(7));
      await expect(form.locator('[name="name"]')).toHaveValue("Retwist");
      await form.locator('[name="price"]').fill("60");
      await form.getByLabel("Fixed deposit (£)", { exact: true }).fill("18");
      await form
        .locator('[name="description"]')
        .fill("Loc maintenance and finishing");
      await form.locator('[name="publicationStatus"]').selectOption("draft");
      await form
        .getByRole("button", { name: "Add variation", exact: true })
        .click();
      const variation = form
        .locator("section")
        .filter({
          has: page.getByRole("heading", {
            name: "Sizes, lengths and styles",
            exact: true,
          }),
        })
        .locator("fieldset")
        .last();
      await variation.getByLabel("Name", { exact: true }).fill("Long locs");
      await variation.getByLabel("Price (£)", { exact: true }).fill("90");
      await variation
        .getByLabel("Duration (minutes)", { exact: true })
        .fill("90");
      await form
        .getByRole("button", { name: "Add service", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Saved successfully" }),
      ).toBeVisible();
      await page.screenshot({
        path: `reports/taxonomy-services-${theme}-${width}.png`,
        fullPage: true,
      });
      const body = await page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("taxonomy-requests")).findLast(
            (r) => r.url === "/api/v1/professional/services",
          ).body,
      );
      expect(body).toMatchObject({
        specialityId: id(4),
        templateId: id(7),
        publicationStatus: "draft",
        variations: [
          { name: "Long locs", pricePence: 9000, durationMinutes: 90 },
        ],
      });
      await page.goto(
        `http://127.0.0.1:3004/explore?specialityId=${id(4)}&theme=${theme}`,
      );
      await page.locator("details.discovery-refine>summary").click();
      await expect(page.locator('[name="specialityId"]').last()).toHaveValue(
        id(4),
      );
      await expect(page.locator(".matching-services a").first()).toContainText(
        "Retwist",
      );
      await page.locator(".matching-services a").first().click();
      await expect(page).toHaveURL(new RegExp(`service=${id(12)}`));
      await expect(page.locator("#services")).toContainText("Retwist");
      await expect(page.locator("#services")).not.toContainText(
        "Knotless Braids",
      );
      await expect(
        page.locator('#portfolio img[alt="Loc portfolio example"]'),
      ).toBeVisible();
      await expect(
        page.locator('#portfolio img[alt="Braiding portfolio example"]'),
      ).toHaveCount(0);
      const booking = page.locator("#booking");
      await booking.getByLabel("Size, length or style").selectOption(id(13));
      await booking.getByLabel("Loc styling").check();
      await expect(booking.locator(".booking-service-preview")).toContainText(
        "£101.00 total",
      );
      await expect(booking.locator(".booking-service-preview")).toContainText(
        "105 min",
      );
      await page.screenshot({
        path: `reports/taxonomy-profile-${theme}-${width}.png`,
        fullPage: true,
      });
      await booking
        .locator('input[type="date"]')
        .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await booking.locator(".booking-times button").first().click();
      await booking
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await booking.getByRole("checkbox").first().check();
      const early = booking.getByRole("checkbox").nth(1);
      if (await early.count()) await early.check();
      await booking
        .getByRole("button", { name: "Continue to pay £31.00" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Booking request received" }),
      ).toBeVisible();
      const request = await page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("taxonomy-requests")).findLast(
            (r) => r.url === "/api/v1/bookings",
          ).body,
      );
      expect(request.variationId).toBe(id(13));
      expect(request.extraIds).toEqual([id(14)]);
      await page.goto(`http://127.0.0.1:3004/discover?theme=${theme}`);
      await page.getByText("Filter by speciality", { exact: true }).click();
      const discoverFilter = page.locator(".taxonomy-discover-filter");
      await discoverFilter
        .getByLabel("Category", { exact: true })
        .selectOption(id(1));
      await discoverFilter
        .getByLabel("Speciality", { exact: true })
        .selectOption(id(4));
      await page.screenshot({
        path: `reports/taxonomy-discover-filter-${theme}-${width}.png`,
        fullPage: true,
      });
      await discoverFilter
        .getByRole("button", { name: "Filter Discover", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`specialityId=${id(4)}`));
      await expect(page.getByText("Retwist finishing").first()).toBeVisible();
      await expect(page.getByText("Knotless Braids finishing")).toHaveCount(0);
      await page.goto(`http://127.0.0.1:3004/admin?theme=${theme}`);
      const categories = page.locator(".category-manager");
      await categories
        .getByRole("button", { name: "Add category", exact: true })
        .click();
      await categories
        .getByLabel("Category name", { exact: true })
        .fill("Wellness");
      await categories
        .getByLabel("Description", { exact: true })
        .fill("Independent wellness services");
      await categories
        .getByRole("button", { name: "Create category", exact: true })
        .click();
      await expect(
        categories.getByRole("status").filter({ hasText: "added" }),
      ).toBeVisible();
      const categoryRequest = await page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("taxonomy-requests")).findLast(
            (r) => r.url === "/api/v1/admin/taxonomy",
          ).body,
      );
      expect(categoryRequest).toMatchObject({
        operation: "category",
        name: "Wellness",
        description: "Independent wellness services",
      });
      await page.getByLabel("Definition type").selectOption("speciality");
      await page.getByLabel("Edit definition").selectOption(id(4));
      await expect(page.locator('input[name="name"]').first()).toHaveValue(
        "Locs",
      );
      await page
        .locator('input[name="reason"]')
        .first()
        .fill("Update reviewed loc speciality");
      await page
        .getByRole("button", { name: "Save speciality", exact: true })
        .click();
      await expect(
        page.getByText("Catalogue updated and recorded").first(),
      ).toBeVisible();
      await page.screenshot({
        path: `reports/taxonomy-admin-${theme}-${width}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow).toBe(false);
      results.push({
        width,
        theme,
        specialitySelection: true,
        serviceVariation: true,
        serviceSearch: true,
        filteredProfile: true,
        bookingOptions: true,
        filteredDiscover: true,
        adminEditing: true,
        errors,
      });
      await context.close();
    }
  await writeFile(
    "reports/taxonomy-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} catch (error) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  await Promise.all(
    pages.map((page, i) =>
      page
        .screenshot({
          path: `reports/taxonomy-failure-${i}.png`,
          fullPage: true,
        })
        .catch(() => {}),
    ),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
