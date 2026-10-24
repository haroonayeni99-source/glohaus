import { expect, test } from "@playwright/test";
test("Shop mobile category rail keeps labels apart and scrolls to the final collection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only layout regression");
  await page.goto("/shop");
  const rail=page.locator(".marketplace-sidebar");
  const links=rail.locator("nav a");
  await expect(rail.getByRole("link",{name:"Deals & offers",exact:true})).toBeAttached();
  const geometry=await rail.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,wrap:getComputedStyle(el).flexWrap}));
  expect(geometry.wrap).toBe("nowrap");
  expect(geometry.scroll).toBeGreaterThan(geometry.width);
  const bounds=await links.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width};}));
  for(let i=1;i<bounds.length;i++) expect(bounds[i].left).toBeGreaterThanOrEqual(bounds[i-1].right);
  await rail.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  await rail.getByRole("link",{name:"Deals & offers",exact:true}).click();
  await expect(page).toHaveURL(/collection=deals/);
});
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
  const categoryId = "11111111-1111-4111-8111-111111111111";
  await page.goto(`/shop?q=Oil&categoryId=${categoryId}`);
  await page.getByRole("link", { name: "Bestsellers", exact: true }).click();
  await expect(page).toHaveURL(/q=Oil&collection=bestsellers&categoryId=/);
  await expect(
    page.getByRole("heading", { name: "Bestsellers for “Oil”" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trending", exact: true }).click();
  await expect(page).toHaveURL(/collection=trending/);
  // This browser server deliberately has no DATABASE_URL. That is an outage,
  // not a successful empty collection (covered by shop-page-failure.test.ts).
  const outage = page
    .getByRole("alert")
    .filter({ hasText: "The marketplace couldn’t load." });
  await expect(
    outage.getByRole("heading", { name: "The marketplace couldn’t load." }),
  ).toBeVisible();
  const retryRequest = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === "/shop",
  );
  await outage.getByRole("button", { name: "Try again", exact: true }).click();
  const retry = await retryRequest;
  expect(retry.method()).toBe("GET");
  expect(new URL(retry.url()).searchParams.get("q")).toBe("Oil");
  expect(new URL(retry.url()).searchParams.get("collection")).toBe("trending");
  expect(new URL(retry.url()).searchParams.get("categoryId")).toBe(categoryId);
  await expect(outage).toContainText("The marketplace couldn’t load.");
  await page.getByRole("link", { name: "Deals & offers", exact: true }).click();
  await expect(page).toHaveURL(/collection=deals/);
  await expect(
    page.getByRole("heading", { name: "Deals & offers for “Oil”" }),
  ).toBeVisible();
  await expect(outage).toContainText("The marketplace couldn’t load.");
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
