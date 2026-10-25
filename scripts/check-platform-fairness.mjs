// Real components; fictional data and intercepted writes. No provider/payment calls.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/platform-fairness-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const chrome = await chromium.launch({
  executablePath: process.env.GLOHAUS_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
let safari;
const results = [];
const id = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(64);
const ticket = {
  id,
  topic: "Booking",
  message: "Fictional private case message",
  status: "resolved",
  created_at: "2026-10-24T12:00:00Z",
  response_due_at: "2026-10-27T12:00:00Z",
  first_response_at: null,
  events: [
    {
      id: "event",
      status: "resolved",
      body: "Support reviewed this fictional case",
      public: true,
      fromStaff: true,
      created_at: "2026-10-24T12:00:00Z",
    },
  ],
  evidence: [],
};
try {
  safari = await webkit.launch();
  for (const [name, browser, profile] of [
    ["iphone", safari, devices["iPhone 13"]],
    ["android", chrome, devices["Pixel 7"]],
    [
      "small-android",
      chrome,
      { ...devices["Pixel 7"], viewport: { width: 320, height: 760 } },
    ],
    ["desktop", chrome, { viewport: { width: 1440, height: 1000 } }],
  ]) {
    for (const theme of ["light", "night"]) {
      const page = await browser.newPage(profile);
      const writes = [];
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
        route.abort(),
      );
      await page.route("**/api/v1/**", (route) => {
        const request = route.request();
        if (request.method() !== "GET")
          writes.push({ url: request.url(), body: request.postDataJSON() });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            request.method() === "GET" ? ticket : { saved: true },
          ),
        });
      });
      const goto = async (view, extra = "") =>
        page.goto(`http://127.0.0.1:3004/?theme=${theme}&view=${view}${extra}`);
      await goto("owner");
      expect(writes).toHaveLength(0);
      const close = page.locator("#founding-programme form").first();
      await close
        .getByLabel("Reason", { exact: true })
        .fill("Owner decided to end new enrolment");
      await close
        .getByRole("button", { name: "Close programme", exact: true })
        .click();
      expect(writes).toHaveLength(0);
      await close.getByRole("checkbox").check();
      await close
        .getByRole("button", { name: "Close programme", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Programme status saved",
      );
      expect(writes.at(-1).body.action).toBe("close");
      await page
        .getByText("Permanently Retire Programme", { exact: true })
        .click();
      const retire = page.locator("details form").first();
      await retire
        .getByLabel("Reason", { exact: true })
        .fill("Permanent retirement validation fixture");
      await retire
        .getByLabel("Type PERMANENTLY RETIRE FOUNDING PROGRAMME")
        .fill("incorrect");
      await retire.getByRole("checkbox").check();
      const count = writes.length;
      await retire
        .getByRole("button", {
          name: "Permanently retire programme",
          exact: true,
        })
        .click();
      expect(writes).toHaveLength(count);
      await retire
        .getByLabel("Type PERMANENTLY RETIRE FOUNDING PROGRAMME")
        .fill("PERMANENTLY RETIRE FOUNDING PROGRAMME");
      await retire
        .getByRole("button", {
          name: "Permanently retire programme",
          exact: true,
        })
        .click();
      await expect.poll(() => writes.length).toBe(count + 1);
      expect(writes.at(-1).body.confirmation).toBe(
        "PERMANENTLY RETIRE FOUNDING PROGRAMME",
      );
      await goto("owner", "&state=retired");
      await expect(
        page.getByRole("button", { name: "Open programme", exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText("Status: retired")).toBeVisible();
      await goto("source");
      await page
        .getByText("How did you find this professional? (optional)", {
          exact: true,
        })
        .click();
      await page.getByRole("combobox").selectOption("new_professional");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Save source confirmation", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Answer recorded");
      expect(writes.at(-1).body.source).toBe("new_professional");
      await goto("ticket", `#token=${token}`);
      await expect(
        page.getByText("Fictional private case message", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Reply or provide more information")
        .fill("Please review my new evidence and consider this appeal");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect.poll(() => writes.at(-1)?.body.appeal).toBe(true);
      await goto("support");
      await page
        .getByRole("button", { name: "Open case / reply", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: `Case ${id}` }),
      ).toBeVisible();
      await expect(
        page.getByText("Support reviewed this fictional case", { exact: true }),
      ).toBeVisible();
      await goto("review");
      await page.getByText("Respond to this review", { exact: true }).click();
      await page
        .getByLabel("Public professional response")
        .fill("Thank you for sharing your experience with us");
      await page
        .getByRole("button", { name: "Save response", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Response saved");
      await goto("report");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `reports/fairness-${name}-${theme}.png`,
        fullPage: true,
      });
      results.push({
        device: name,
        theme,
        result: "PASS",
        interceptedWrites: writes.length,
      });
      await page.close();
    }
  }
  await writeFile(
    "reports/platform-fairness-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await chrome.close();
  await safari?.close();
  await new Promise((resolve) => server.close(resolve));
}
