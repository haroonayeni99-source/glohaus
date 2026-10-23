import { expect, test } from "@playwright/test";

test("nonced production pages hydrate, preserve themes and reject untrusted inline code", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|violates.*directive/i.test(message.text())
    )
      violations.push(message.text());
  });
  const response = await page.goto("/sign-in");
  const policy = response!.headers()["content-security-policy"];
  const nonce = /'nonce-([^']+)'/.exec(policy)![1];
  expect(
    await page
      .locator("#glohaus-theme-bootstrap")
      .evaluate((node) => (node as HTMLScriptElement).nonce),
  ).toBe(nonce);
  expect(
    await page
      .locator("script[src]")
      .evaluateAll((nodes) =>
        nodes.every((node) => Boolean((node as HTMLScriptElement).nonce)),
      ),
  ).toBe(true);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to night mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__glohausUntrustedScriptRan = true";
    document.head.appendChild(script);
  });
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __glohausUntrustedScriptRan?: boolean })
          .__glohausUntrustedScriptRan,
    ),
  ).toBeUndefined();
});
