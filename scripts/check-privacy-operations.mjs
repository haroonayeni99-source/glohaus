// Real components with fictional cases and intercepted requests. No external services.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/privacy-operations-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const chrome = await chromium.launch({
  executablePath: process.env.GLOHAUS_TEST_BROWSER,
  args: ["--no-sandbox"],
});
let safari;
const results = [];
const id = "11111111-1111-4111-8111-111111111111";
try {
  safari = await webkit.launch();
  for (const [device, browser, profile] of [
    ["iphone-emulation", safari, devices["iPhone 13"]],
    [
      "small-android-emulation",
      chrome,
      { ...devices["Pixel 7"], viewport: { width: 320, height: 900 } },
    ],
    ["desktop", chrome, { viewport: { width: 1440, height: 1000 } }],
  ])
    for (const theme of ["light", "night"]) {
      const page = await browser.newPage(profile);
      const requests = [];
      const errors = [];
      let fail = true;
      let data = {
        id,
        kind: "privacy_request",
        identity: "unreviewed",
        holdReason: "",
        nextReviewAt: null,
        closedAt: null,
        receivedOn: "2026-10-25",
        rightsDueAt: "2026-11-25T23:59:59Z",
        evidenceReviewAt: null,
        caseReviewAt: null,
      };
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await page.route("**/api/v1/**", (route) => {
        const req = route.request();
        requests.push({
          url: req.url(),
          method: req.method(),
          body: req.method() === "GET" ? null : req.postDataJSON(),
        });
        if (req.method() === "POST") {
          if (fail)
            return route.fulfill({
              status: 403,
              contentType: "application/json",
              body: '{"error":{"code":"FORBIDDEN"}}',
            });
          const body = req.postDataJSON();
          data = {
            ...data,
            kind: body.kind,
            identity: body.identity,
            holdReason: body.holdReason,
            nextReviewAt: body.nextReviewAt,
            receivedOn: body.receivedOn,
          };
          return route.fulfill({ json: { saved: true } });
        }
        if (req.url().includes("operations"))
          return route.fulfill({
            json: req.url().includes("caseId=")
              ? data
              : {
                  rightsPending: 1,
                  items: [
                    {
                      id,
                      topic: "Privacy & data request",
                      status: "open",
                      kind: "privacy_request",
                      rightsDueAt: data.rightsDueAt,
                      onHold: false,
                      reviewAt: null,
                    },
                  ],
                },
          });
        return route.fulfill({
          json: {
            id,
            topic: "Privacy & data request",
            message: "Fictional request",
            status: "open",
            created_at: "2026-10-25T12:00:00Z",
            response_due_at: "2026-10-27T12:00:00Z",
            first_response_at: null,
            events: [],
            evidence: [],
          },
        });
      });
      const go = (q = "") =>
        page.goto(`http://127.0.0.1:3004/?theme=${theme}&${q}`);
      await go("role=admin");
      await expect(
        page.getByText("Private support cases.", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".support-operations")).toHaveCount(0);
      await go("role=owner");
      await expect(
        page.getByRole("button", { name: "Open review", exact: true }),
      ).toBeVisible();
      expect(requests).toHaveLength(0);
      await page
        .getByRole("button", { name: "Open review", exact: true })
        .click();
      await expect(
        page.getByText("1 open data-rights requests.", { exact: false }),
      ).toBeVisible();
      expect(requests).toHaveLength(1);
      await page
        .getByRole("button", { name: "Open case for review", exact: true })
        .click();
      const selected = page
        .locator(".support-operations")
        .filter({
          has: page.getByRole("heading", {
            name: "Privacy, identity & retention review",
            exact: true,
          }),
        });
      await selected
        .getByRole("button", { name: "Open review", exact: true })
        .click();
      await selected
        .getByLabel("Identity review", { exact: true })
        .selectOption("verified");
      await selected
        .getByLabel("Retention hold justification (leave blank if none)", {
          exact: true,
        })
        .fill("a".repeat(500));
      await selected
        .getByLabel("Next review date (required for a hold)", { exact: true })
        .fill("2026-11-01");
      await selected
        .getByLabel("Review reason and actions taken", { exact: true })
        .fill("b".repeat(500));
      await selected
        .getByRole("button", {
          name: "Record privacy / retention review",
          exact: true,
        })
        .click();
      await expect(selected.getByRole("status")).toContainText("Not saved");
      await expect(
        selected.getByLabel("Review reason and actions taken", { exact: true }),
      ).toHaveValue("b".repeat(500));
      fail = false;
      await selected
        .getByRole("button", {
          name: "Record privacy / retention review",
          exact: true,
        })
        .click();
      await expect(selected.getByRole("status")).toContainText(
        "Review recorded privately",
      );
      await expect(
        selected.getByLabel("Identity review", { exact: true }),
      ).toHaveValue("verified");
      await selected.locator("summary").click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await go("view=contact");
      await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
        "Privacy & data request",
      );
      await go("view=phone");
      await expect(
        page.getByText("This device reports:", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("no item here is automatically marked verified.", {
          exact: false,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
      results.push({
        device,
        theme,
        result: "PASS",
        scope:
          "isolated UI; physical device and real email delivery remain unverified",
      });
      await page.close();
    }
  await writeFile(
    "reports/privacy-operations-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await chrome.close();
  await safari?.close();
  await new Promise((r) => server.close(r));
}
