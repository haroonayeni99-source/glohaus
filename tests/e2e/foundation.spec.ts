import { expect, test } from "@playwright/test";

test("public entry works on mobile and desktop", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Good afternoon",
    );
    await expect(
      page.getByRole("heading", { name: "Recommended professionals" }),
    ).toBeVisible();
    await expect(page.locator('a[href="/messages"]:visible').first()).toBeVisible();
    await expect(page.locator('a[href="/wallet"], a[href="/glohaus-plus"]')).toHaveCount(0);
    await expect(page.getByText("Coming soon", { exact: true }).first()).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: /Real Beauty\s*Real People\s*Real Results/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Find Your Glow" })).toHaveAttribute(
      "href",
      "/discover",
    );
    await expect(page.getByRole("navigation", { name: "Beauty categories" })).toBeVisible();
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.goto("/sign-up?intent=professional");
  await expect(page).toHaveURL(/sign-up\?intent=professional/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your GLOHAUS account is nearly ready.",
  );
  expect(errors).toEqual([]);
});

test("private routes fail closed without credentials", async ({
  page,
  request,
}) => {
  for (const route of [
    "/account",
    "/professional",
    "/professional/profile",
    "/admin",
    "/onboarding",
    "/security",
    "/messages",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your GLOHAUS account is nearly ready.",
    );
    await expect(
      page.getByText("Account created", { exact: true }),
    ).toHaveCount(0);
  }
  for (const route of ["/api/v1/me", "/api/v1/admin/access"]) {
    const response = await request.get(route);
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "UNAVAILABLE" } });
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("missing pages offer a working route home", async ({ page }, testInfo) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "This page isn’t here",
  );
  await page.getByRole("link", { name: "Back to glohaus" }).click();

  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Good afternoon",
    );
  } else {
    await expect(
      page.getByRole("heading", { name: /Real Beauty\s*Real People\s*Real Results/ }),
    ).toBeVisible();
  }
});


test("dedicated Discover route behaves like a full-screen mobile feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");

  const feed = page.getByLabel("Beauty inspiration feed. Scroll to see the next post.");
  await expect(feed).toBeVisible();

  const metrics = await feed.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      scrollSnapType: style.scrollSnapType,
      height: Math.round(rect.height),
      viewport: window.innerHeight,
    };
  });
  expect(metrics.scrollSnapType).toContain("y");
  expect(Math.abs(metrics.height - metrics.viewport)).toBeLessThanOrEqual(4);

  await expect(
    page.locator('.glohaus-bottom-nav [aria-current="page"]'),
  ).toHaveText("Discover");

  const firstShare = page.getByRole("button", { name: /^Share / }).first();
  await firstShare.click();
  await expect(page.getByLabel("Post link")).toHaveValue(/\/discover#post-/);
});


test("Following requires a customer session on Discover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");

  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=.*discover.*feed.*following/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your GLOHAUS account is nearly ready.",
  );
});


test("professional auth preserves professional intent", async ({ page }) => {
  await page.goto("/sign-in?intent=professional&returnTo=/professional");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an account" }),
  ).toHaveAttribute(
    "href",
    "/sign-up?intent=professional&returnTo=/professional/setup",
  );
  await expect(
    page.getByRole("link", { name: "Preview GLOHAUS PRO without signing in" }),
  ).toHaveAttribute("href", "/professional-preview");

  await page.goto("/sign-up?intent=professional");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Create your professional account",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in?intent=professional&returnTo=/professional",
  );
});

test("professional preview exposes real auth entry points", async ({ page }) => {
  await page.goto("/professional-preview");
  await expect(
    page.getByRole("link", { name: "Professional sign in" }).first(),
  ).toHaveAttribute(
    "href",
    "/sign-in?intent=professional&returnTo=/professional",
  );
  await expect(
    page.getByRole("link", { name: "Create PRO account" }),
  ).toHaveAttribute(
    "href",
    "/sign-up?intent=professional&returnTo=/professional/setup",
  );
});

test("theme toggle switches professional preview to night mode", async ({ page }) => {
  await page.goto("/professional-preview");
  const toggle = page.getByRole("button", { name: "Switch to night mode" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
});
