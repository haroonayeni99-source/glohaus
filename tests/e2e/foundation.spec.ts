import { expect, test } from "@playwright/test";

test("public entry works on mobile and desktop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /A little scroll\.|Good afternoon/,
  );
  await expect(
    page.getByRole("heading", { name: "It’s all in the details." }),
  ).toBeVisible();
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
      "A little preparation",
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

test("missing pages offer a working route home", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "This page isn’t here",
  );
  await page.getByRole("link", { name: "Back to glohaus" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /A little scroll|Good afternoon/,
  );
});
