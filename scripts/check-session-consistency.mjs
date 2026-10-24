// Session/navigation regression with real UI and isolated fictional Auth events.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/session-entry.tsx";
process.env.GLOHAUS_UI_AUDIT_AUTH = "tests/fixtures/session-auth-client.ts";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
const results = [];
const photo = await readFile("public/images/categories/nails-v2.webp");
try {
  for (const theme of ["light", "night"])
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
        route.request().resourceType() === "image"
          ? route.fulfill({ contentType: "image/webp", body: photo })
          : route.abort(),
      );
      await context.route("**/images/**", (route) =>
        route.fulfill({ contentType: "image/webp", body: photo }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:3004/faq?theme=${theme}`);
      const account = () => page.locator(".glohaus-header .glohaus-sign-in");
      await expect(account()).toHaveText("Sign in");
      await page.getByTestId("fixture-login").click();
      await expect(account()).toHaveText("My account");
      for (const path of [
        "/faq",
        "/terms",
        "/explore",
        "/professional-preview",
        "/wallet",
      ]) {
        await page.goto(`http://127.0.0.1:3004${path}`);
        await expect(account()).toHaveText("My account");
        await expect(
          page.locator(".glohaus-header .glohaus-sign-up"),
        ).toHaveCount(0);
      }
      await page.goto("http://127.0.0.1:3004/");
      if (width < 1100) {
        await expect(page.locator(".home-mobile-signin")).toHaveCount(0);
        await expect(
          page.locator(".mobile-home-header .glohaus-signout").first(),
        ).toBeVisible();
      } else {
        await expect(
          page.locator(".customer-desktop-topbar .glohaus-signout"),
        ).toBeVisible();
      }
      // A second tab shares Auth changes, even when its page passed a stale hint.
      const other = await context.newPage();
      await other.goto("http://127.0.0.1:3004/wallet");
      await expect(other.locator(".glohaus-sign-in")).toHaveText("My account");
      await page.goto("http://127.0.0.1:3004/terms");
      await page.goto("http://127.0.0.1:3004/faq");
      if (width >= 1100) await page.goto("http://127.0.0.1:3004/");
      const menu = page.locator(
        width >= 1100 ? ".customer-desktop-topbar" : ".mobile-site-menu",
      );
      if (width < 1100) await menu.locator("summary").click();
      await page.evaluate(() => sessionStorage.setItem("fail-signout", "yes"));
      await menu.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(menu.getByRole("alert")).toContainText(
        "could not sign you out",
      );
      if (width < 1100) await expect(account()).toHaveText("My account");
      else
        await expect(page.locator(".desktop-user-chip")).toContainText(
          "My account",
        );
      await Promise.all([
        page.waitForEvent("load"),
        menu.getByRole("button", { name: "Sign out", exact: true }).click(),
      ]);
      await expect(page).toHaveURL("http://127.0.0.1:3004/");
      await expect(other.locator(".glohaus-sign-in")).toHaveText("Sign in");
      await page.goBack();
      await expect(page.locator(".glohaus-sign-in")).toHaveText("Sign in");
      for (const path of ["/terms", "/wallet", "/professional-preview"]) {
        await page.goto(`http://127.0.0.1:3004${path}`);
        await expect(page.locator(".glohaus-sign-in")).toHaveText(
          path === "/professional-preview" ? "Professional sign in" : "Sign in",
        );
        expect(await page.locator(".glohaus-signout").count()).toBe(0);
      }
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `reports/session-${theme}-${width}.png`,
        fullPage: true,
      });
      results.push({
        theme,
        width,
        loginAcrossPages: true,
        logoutAcrossTabs: true,
        backAfterLogout: true,
        signoutRetry: true,
        errors,
      });
      await context.close();
    }
  await writeFile(
    "reports/session-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
