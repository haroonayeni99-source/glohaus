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
    await expect(page.locator('a[href="/messages"], a[href="/wallet"], a[href="/glohaus-plus"]')).toHaveCount(0);
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


test("dedicated Discover route renders the existing feed on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");

  await expect(
    page.getByText("DISCOVER. BOOK. GET INSPIRED.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Beauty inspiration feed. Scroll to see the next post."),
  ).toBeVisible();
});
