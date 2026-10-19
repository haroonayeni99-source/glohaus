// Full Next.js example routes on an isolated origin. No production accounts,
// credentials, database writes, payments or messages are used.
import { chromium, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3017";
const slugs = [
  "root-and-ritual",
  "crown-canvas",
  "still-cuts",
  "gloss-house",
  "muse-makeup-room",
  "lift-lash-studio",
  "frame-brow-room",
  "soft-skin-studio",
  "smooth-ritual",
  "contour-consult",
];
const results = [],
  browsers = [];
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3017",
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: "",
      PAYMENT_DATABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_APP_URL: base,
    },
    stdio: "ignore",
  },
);
await mkdir("reports", { recursive: true });
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/profile-examples`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 50000 },
    )
    .toBe(200);
  for (const [engine, launcher, widths] of [
    ["chromium", chromium, [320, 390, 1440]],
    ["webkit", webkit, [390]],
  ]) {
    const browser = await launcher.launch({
      headless: true,
      ...(engine === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    browsers.push(browser);
    for (const theme of ["light", "night"])
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          ...(width < 700 ? { isMobile: true, hasTouch: true } : {}),
        });
        const page = await context.newPage(),
          errors = [],
          mutations = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("request", (r) => {
          if (!["GET", "HEAD"].includes(r.method()))
            mutations.push({
              method: r.method(),
              path: new URL(r.url()).pathname,
            });
        });
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
        await page.addInitScript(
          (value) => localStorage.setItem("glohaus-theme", value),
          theme,
        );
        await page.goto(`${base}/profile-examples`);
        await expect(page.locator(".profile-example-card")).toHaveCount(10);
        await page
          .getByRole("combobox", { name: "Category", exact: true })
          .selectOption("Hair");
        await page.getByRole("button", { name: "Show examples" }).click();
        await expect(page.locator(".profile-example-card")).toHaveCount(3);
        await page.getByRole("link", { name: "Reset", exact: true }).click();
        await expect(page.locator(".profile-example-card")).toHaveCount(10);
        await expect(
          page.getByRole("combobox", { name: "Category", exact: true }),
        ).toHaveValue("");
        await page
          .getByRole("combobox", { name: "Category", exact: true })
          .selectOption("Nails");
        await page.getByRole("link", { name: "Reset", exact: true }).click();
        await expect(
          page.getByRole("combobox", { name: "Category", exact: true }),
        ).toHaveValue("");
        await expect(page.locator(".profile-example-card")).toHaveCount(10);
        await page
          .locator(".profile-example-card-image img")
          .evaluateAll((images) =>
            images.forEach((image) => {
              image.loading = "eager";
            }),
          );
        await expect
          .poll(() =>
            page
              .locator(".profile-example-card-image img")
              .evaluateAll(
                (images) =>
                  images.length === 10 &&
                  images.every(
                    (image) => image.complete && image.naturalWidth > 0,
                  ),
              ),
          )
          .toBe(true);
        // Next can briefly retain matching streamed metadata during navigation.
        // Verify every emitted policy rather than assuming one physical tag.
        await expect
          .poll(() =>
            page
              .locator('meta[name="robots"]')
              .evaluateAll(
                (tags) =>
                  tags.length > 0 &&
                  tags.every((tag) =>
                    /\bnoindex\b/.test(tag.getAttribute("content") || ""),
                  ),
              ),
          )
          .toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `reports/profile-examples-gallery-${engine}-${theme}-${width}.png`,
          fullPage: true,
        });
        for (const slug of slugs) {
          await page.goto(`${base}/profile-examples/${slug}`);
          await expect(page.locator(".profile-example-banner")).toContainText(
            "FICTIONAL BUSINESS",
          );
          await expect(page.locator(".service-list article")).toHaveCount(3);
          await expect(
            page.getByRole("button", { name: /^(Follow|Book|Pay)/ }),
          ).toHaveCount(0);
          const structuredData = await page
            .locator('script[type="application/ld+json"]')
            .allTextContents();
          expect(structuredData.length).toBeGreaterThan(0);
          expect(
            structuredData.every(
              (text) =>
                !/"BeautySalon"|"LocalBusiness"|"AggregateRating"/.test(text),
            ),
          ).toBe(true);
          const destinations = await page
            .locator(".professional-public a")
            .evaluateAll((links) =>
              links.map((a) => a.getAttribute("href") || ""),
            );
          expect(
            destinations.some((h) =>
              /^\/p\/|^\/api\/|^\/messages|^https?:|^tel:|^mailto:/.test(h),
            ),
          ).toBe(false);
          // Load every illustration for asset checks, including offscreen lazy images.
          await page.locator(".professional-public img").evaluateAll((images) =>
            images.forEach((image) => {
              image.loading = "eager";
            }),
          );
          await expect
            .poll(() =>
              page
                .locator(".professional-public img")
                .evaluateAll((images) =>
                  images.every((i) => i.complete && i.naturalWidth > 0),
                ),
            )
            .toBe(true);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page
            .locator(".service-list article")
            .first()
            .getByRole("link", { name: "Preview service & options" })
            .click();
          await expect(page.locator("#booking h2")).toBeVisible();
          await expect(page).toHaveURL(
            /\/profile-examples\/[^?]+\?service=example-/,
          );
          if (["root-and-ritual", "still-cuts", "gloss-house"].includes(slug))
            await page.screenshot({
              path: `reports/profile-examples-${slug}-${engine}-${theme}-${width}.png`,
              fullPage: true,
            });
          results.push({ slug, engine, theme, width, passed: true });
        }
        expect(errors).toEqual([]);
        expect(mutations).toEqual([]);
        await context.close();
      }
  }
  expect((await fetch(`${base}/profile-examples/not-a-template`)).status).toBe(
    404,
  );
  await writeFile(
    "reports/profile-examples-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({
      examples: slugs.length,
      browserCases: results.length,
      unknownProfile404: true,
      mutations: 0,
      allPassed: true,
    }),
  );
} catch (error) {
  for (const [i, browser] of browsers.entries())
    for (const [j, context] of browser.contexts().entries())
      for (const [k, page] of context.pages().entries()) {
        await page
          .screenshot({
            path: `reports/profile-examples-failed-${i}-${j}-${k}.png`,
            fullPage: true,
          })
          .catch(() => {});
      }
  throw error;
} finally {
  for (const browser of browsers) await browser.close();
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await stopped;
}
