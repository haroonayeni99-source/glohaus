import { expect, test } from "@playwright/test";

test("professional referral campaign link reaches the existing protected dashboard section", async ({ page }) => {
  await page.goto("/professional/referrals");
  await expect(page).toHaveURL(/\/professional#referrals$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn’t load your account right now.");
});

test("public entry works on mobile and desktop", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Beauty that\s*feels like you\./);
    await expect(page.getByRole("navigation", { name: "Customer navigation" }).getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("href", "/explore");
    await expect(page.locator(".customer-desktop-topbar").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in");
    await expect(page.locator(".customer-desktop-topbar").getByRole("link", { name: "Join GLOHAUS", exact: true })).toHaveAttribute("href", "/sign-up");
  } else {
    await expect(
      page.getByRole("heading", { name: /Discover\.\s*Book\.\s*Get inspired\./ }),
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
    "We couldn’t load your account right now.",
  );
  expect(errors).toEqual([]);
});

test("sign-up asks whether the account is customer or professional", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(
    page.getByRole("heading", { name: "How will you use GLOHAUS?" }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: /Sign up as a Customer/ }),
  ).toHaveAttribute("href", "/sign-up?intent=customer");

  await expect(
    page.getByRole("link", { name: /Sign up as a Professional/ }),
  ).toHaveAttribute("href", "/sign-up?intent=professional");
});

test("signed-out desktop navigation exposes public destinations and account entry points", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Customer navigation" });
  for (const [name, href] of [["Home", "/"], ["Explore", "/explore"], ["Get inspired", "/discover"], ["Shop", "/shop"], ["How it works", "/how-it-works"], ["For professionals", "/sign-up?intent=professional"]]) {
    await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(navigation.getByRole("link", { name: /Bookings|Messages|Wallet|Profile/ })).toHaveCount(0);
  await expect(page.locator(".customer-desktop-topbar").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("signed-out mobile navigation preserves private return routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/discover", "/explore", "/shop"]) {
    await page.goto(route);
    const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(navigation.getByRole("link", { name: "Bookings" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Faccount%2Fbookings",
    );
    await expect(navigation.getByRole("link", { name: "Messages" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Fmessages",
    );
    await expect(navigation.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Fworkspace",
    );
  }

  await page.goto("/");
  await expect(page.locator(".mobile-customer-home").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in");
  await page.goto("/share");
  await expect(page.getByRole("link", { name: "Your notifications" })).toHaveAttribute(
    "href",
    "/sign-in?returnTo=%2Fnotifications",
  );
  await expect(
    page.locator(".discovery-sidebar a.discovery-nav").filter({ hasText: "Your space" }),
  ).toHaveAttribute("href", "/sign-in?returnTo=%2Fworkspace");

  await page.goto("/shop");
  await expect(page.getByRole("link", { name: "Cart" })).toHaveAttribute(
    "href",
    "/sign-in?returnTo=%2Fcart",
  );
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
    "/professional/products",
    "/cart",
    "/account/orders",
    "/professional/orders",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "We couldn’t load your account right now.",
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
      "Beauty that",
    );
  } else {
    await expect(
      page.getByRole("heading", { name: /Discover\.\s*Book\.\s*Get inspired\./ }),
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


test("Share keeps its dedicated route and a working Discover entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/share");

  await expect(
    page.locator('.glohaus-bottom-nav [aria-current="page"]'),
  ).toHaveText("Discover");
  await expect(page.getByText("SHARE. CONNECT. BOOK.")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Discover" }),
  ).toHaveAttribute("href", "/discover");
});


test("Following requires a customer session on Share", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/share");

  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=.*share.*feed.*following/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "We couldn’t load your account right now.",
  );
});


test("professional auth preserves professional intent", async ({ page }) => {
  await page.goto("/sign-in?intent=professional&returnTo=/professional");
  await expect(page.getByText("GLOHAUS PRO", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /See a GLOHAUS PRO page preview/ }),
  ).toHaveAttribute("href", "/professional-preview");

  await page.goto("/sign-up?intent=professional");
  await expect(page.getByText("GLOHAUS PRO", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /See a GLOHAUS PRO page preview/ }),
  ).toHaveAttribute("href", "/professional-preview");
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


test("saved theme is restored and mobile Home changes with the selected mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("glohaus-theme", "night"));
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();

  const home = page.locator(".mobile-customer-home");
  await expect(home).toBeVisible();
  const nightBackground = await home.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const lightBackground = await home.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(lightBackground).not.toBe(nightBackground);
  expect(await page.evaluate(() => localStorage.getItem("glohaus-theme"))).toBe(
    "light",
  );
});


test("Shop exposes catalogue without fake checkout", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "The Beauty Marketplace",
  );
  await expect(
    page.getByText("Protected marketplace rollout", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /buy now|checkout/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /cart/i }).first()).toBeVisible();
});


test("public policy pages are reachable on mobile and desktop", async ({ page }) => {
  const pages = [
    ["/terms", "Terms of Use"],
    ["/privacy", "Privacy Policy"],
    ["/refunds", "Refunds & Cancellations"],
    ["/professional-terms", "Professional Terms"],
    ["/marketplace-terms", "Marketplace Terms"],
  ] as const;

  for (const [route, heading] of pages) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByText("Draft for legal review", { exact: false })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});


test("sign-in keeps password recovery visible for customer and professional accounts", async ({ page }) => {
  for (const route of [
    "/sign-in",
    "/sign-in?intent=professional&returnTo=/professional",
  ]) {
    await page.goto(route);
    const forgot = page.getByRole("link", { name: "Forgot password?" });
    await expect(forgot).toBeVisible();
    await expect(forgot).toHaveAttribute("href", "/forgot-password");
  }

  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
