import { expect, test } from "@playwright/test";
test("Contact is reachable from the shared footer and preserves failed requests", async ({
  page,
}) => {
  await page.goto("/faq");
  await page.getByRole("button", { name: "Support", exact: true }).click();
  await page.getByText("How do I contact GLOHAUS?", { exact: true }).click();
  await page
    .locator(".faq-answer")
    .getByRole("link", { name: "Contact Us", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Contact Us", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("Fictional Tester");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("fixture@example.test");
  await page
    .getByLabel("Your message", { exact: true })
    .fill(
      "This is a fictional support request used only in isolated browser testing.",
    );
  await page.route("**/api/v1/support", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAVAILABLE" } }),
    }),
  );
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your request could not be sent" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue(
    /fictional support request/,
  );
  await page.unroute("**/api/v1/support");
  await page.route("**/api/v1/support", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    }),
  );
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your request has been received." }),
  ).toBeVisible();
});
test("FAQ has one shared footer with a contact link", async ({ page }) => {
  await page.goto("/faq");
  await expect(
    page.getByRole("heading", {
      name: "Frequently Asked Questions",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(1);
  await expect(
    page
      .getByRole("contentinfo", { name: "Website footer" })
      .getByRole("link", { name: "Contact Us", exact: true }),
  ).toHaveAttribute("href", "/contact");
});
test("Shop collections are real parameters and preserve a search", async ({
  page,
}) => {
  await page.goto("/shop?q=Oil");
  await page.getByRole("link", { name: "Bestsellers", exact: true }).click();
  await expect(page).toHaveURL(/q=Oil&collection=bestsellers#products/);
  await expect(
    page.getByRole("heading", { name: "Bestsellers for “Oil”" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trending", exact: true }).click();
  await expect(page).toHaveURL(/collection=trending/);
  // This browser server deliberately has no DATABASE_URL. That is an outage,
  // not a successful empty collection (covered by shop-page-failure.test.ts).
  await expect(
    page
      .getByRole("alert")
      .getByRole("heading", { name: "The marketplace couldn’t load." }),
  ).toBeVisible();
  const retryRequest = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === "/shop",
  );
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  const retry = await retryRequest;
  expect(retry.method()).toBe("GET");
  expect(new URL(retry.url()).searchParams.get("q")).toBe("Oil");
  expect(new URL(retry.url()).searchParams.get("collection")).toBe("trending");
  await expect(page.getByRole("alert")).toContainText(
    "The marketplace couldn’t load.",
  );
  await page.getByRole("link", { name: "Deals & offers", exact: true }).click();
  await expect(page).toHaveURL(/collection=deals/);
  await expect(
    page.getByRole("heading", { name: "Deals & offers for “Oil”" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "The marketplace couldn’t load.",
  );
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL("/shop#products");
});
test("Shop offers customer information and contact help", async ({ page }) => {
  await page.goto("/shop");
  await expect(
    page.getByText("Shopping with GLOHAUS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Protected marketplace rollout", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "contact GLOHAUS support", exact: true }),
  ).toHaveAttribute("href", "/contact");
});
