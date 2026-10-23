// Real editor and homepage components with isolated storage and mocked requests.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/homepage-media-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
const results = [];
const image = await readFile("public/images/categories/nails-v2.webp");
const uploaded = "https://images.example.test/uploaded-nails.webp";
try {
  for (const theme of ["light", "night"]) {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // No network requests leave the local fixture.
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
        route.request().resourceType() === "image"
          ? route.fulfill({ contentType: "image/webp", body: image })
          : route.abort(),
      );
      await page.route("**/images/categories/*", async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop();
        await route.fulfill({
          contentType: "image/webp",
          body: await readFile(`public/images/categories/${name}`),
        });
      });
      await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
      const editor = page.locator(".owner-category-media");
      const device = editor.getByLabel("Category settings for");
      const nails = editor.getByAltText("Desktop Nails category preview");
      await expect(nails).toHaveAttribute(
        "src",
        "/images/categories/nails-v2.webp",
      );
      expect(
        await nails.evaluate((el) => getComputedStyle(el).borderRadius),
      ).toBe("50%");
      await page.screenshot({
        path: `reports/homepage-media-${theme}-${width}.png`,
        fullPage: true,
      });
      await editor
        .getByLabel("desktop Nails category image", { exact: true })
        .setInputFiles({
          name: "nails.webp",
          mimeType: "image/webp",
          buffer: image,
        });
      await expect(nails).toHaveAttribute("src", uploaded);
      expect(
        await page.evaluate(() => localStorage.getItem("category-images")),
      ).toBeNull();
      await device.selectOption("mobile");
      await expect(
        editor.getByAltText("Mobile Nails category preview"),
      ).toHaveAttribute("src", /photo-1604654894610/);
      await device.selectOption("desktop");
      await expect(nails).toHaveAttribute("src", uploaded);
      await editor
        .getByLabel("desktop Nails category name", { exact: true })
        .fill("Nail art & care");
      await expect(editor.locator("h4").nth(1)).toHaveText("Nail art & care");
      // Failed saves keep the draft, and the same draft can be retried.
      await page.evaluate(() =>
        sessionStorage.setItem("fail-next-save", "MFA_REQUIRED"),
      );
      await editor
        .getByRole("button", { name: "Save category changes", exact: true })
        .click();
      await expect(editor.getByRole("status")).toContainText(
        "security verification has expired",
      );
      expect(
        await page.evaluate(() => localStorage.getItem("category-images")),
      ).toBeNull();
      await expect(nails).toHaveAttribute("src", uploaded);
      await expect(
        editor.getByLabel("desktop Nails category name", { exact: true }),
      ).toHaveValue("Nail art & care");
      expect(
        await page.evaluate(() => localStorage.getItem("category-names")),
      ).toBeNull();
      await editor
        .getByRole("button", { name: "Save category changes", exact: true })
        .click();
      await expect(editor.getByRole("status")).toContainText("now published");
      await page.reload();
      await expect(
        editor.getByAltText("Desktop Nails category preview"),
      ).toHaveAttribute("src", uploaded);
      await expect(
        editor.getByLabel("desktop Nails category name", { exact: true }),
      ).toHaveValue("Nail art & care");
      // A hero save does not erase category settings.
      const hero = page.locator("#homepage-media form").first();
      await hero.locator("details").first().locator("summary").click();
      await hero
        .getByLabel("Desktop hero model image URL", { exact: true })
        .fill("https://images.example.test/desktop-hero.webp");
      await hero
        .getByLabel("Reason for change", { exact: true })
        .fill("Refresh hero independently");
      await hero
        .getByRole("button", { name: "Save homepage images", exact: true })
        .click();
      await expect(hero.getByRole("status")).toContainText("updated");
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("category-images")).desktop.nails,
        ),
      ).toBe(uploaded);
      await page.goto(`http://127.0.0.1:3004/home?theme=${theme}`);
      const desktopNails = page.locator(
        '.desktop-service-row a[href="/explore?q=Nail%20art%20%26%20care"] img',
      );
      const mobileNails = page.locator(
        '.mobile-home-categories a[href="/explore?q=Nails"] img',
      );
      await expect(desktopNails).toHaveAttribute("src", uploaded);
      await expect(mobileNails).toHaveAttribute("src", /photo-1604654894610/);
      await expect(page.locator(".mobile-home-hero img")).toHaveAttribute(
        "src",
        /photo-1488426862026/,
      );
      // Explicit mobile changes are independent from desktop changes.
      await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
      await device.selectOption("mobile");
      await expect(
        editor.getByLabel("mobile Nails category name", { exact: true }),
      ).toHaveValue("Nails");
      await editor
        .getByLabel("mobile Nails category name", { exact: true })
        .fill("Gel nails");
      await editor.locator("details").nth(1).locator("summary").click();
      await editor
        .getByLabel("mobile Nails category image URL", { exact: true })
        .fill("https://images.example.test/mobile-nails.webp");
      await editor
        .getByLabel("Reason for category change")
        .fill("Refresh mobile nails only");
      await editor
        .getByRole("button", { name: "Save category changes", exact: true })
        .click();
      await expect(editor.getByRole("status")).toContainText("now published");
      await device.selectOption("desktop");
      await editor
        .getByRole("button", { name: "Use default for Nails", exact: true })
        .click();
      await expect(
        editor.getByAltText("Desktop Nails category preview"),
      ).toHaveAttribute("src", "/images/categories/nails-v2.webp");
      await editor
        .getByRole("button", { name: "Save category changes", exact: true })
        .click();
      await expect(editor.getByRole("status")).toContainText("now published");
      await page.goto(`http://127.0.0.1:3004/home?theme=${theme}`);
      await expect(
        page.locator('.desktop-service-row a[href="/explore?q=Nails"] img'),
      ).toHaveAttribute("src", "/images/categories/nails-v2.webp");
      await expect(
        page.locator(
          '.mobile-home-categories a[href="/explore?q=Gel%20nails"] img',
        ),
      ).toHaveAttribute("src", "https://images.example.test/mobile-nails.webp");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      results.push({
        theme,
        width,
        uploadPreviewSaveReload: true,
        failedSaveRetry: true,
        deviceIndependence: true,
        singleDefaultRestore: true,
        categoryNamesSaveReloadAndSearch: true,
        categoryNamesFailureRetryAndReset: true,
      });
      await page.close();
    }
  }
  await writeFile(
    "reports/homepage-media-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
