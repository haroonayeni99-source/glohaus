// Isolated UI and fictional evidence only; external requests are blocked.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY =
  "tests/fixtures/service-safeguards-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({
  executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined,
  args: ["--no-sandbox"],
});
const pro = "11111111-1111-4111-8111-111111111111",
  teeth = "22222222-2222-4222-8222-222222222222",
  tattoo = "33333333-3333-4333-8333-333333333333";
const results = [];
try {
  for (const theme of ["light", "night"])
    for (const width of [320, 390, 820, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let reads = 0,
        failRefresh = false;
      const writes = [];
      let approvals = [];
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
        route.abort(),
      );
      await page.route("**/api/v1/admin/service-safeguards", async (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          writes.push(body);
          approvals = [
            {
              professional_id: pro,
              category_id: teeth,
              business_name: "Fictional Studio",
              status: body.status,
              registration_reference: "123456",
              valid_until: "2027-01-01T00:00:00Z",
              updated_at: new Date().toISOString(),
            },
          ];
          if (body.status === "approved") failRefresh = true;
          await route.fulfill({ json: { saved: true, refreshPending: false } });
        } else {
          reads++;
          if (failRefresh) {
            failRefresh = false;
            await route.fulfill({
              status: 503,
              json: { error: { code: "UNAVAILABLE" } },
            });
            return;
          }
          await route.fulfill({
            json: {
              categories: [
                {
                  id: teeth,
                  name: "Teeth Whitening",
                  kind: "dentistry",
                  active: false,
                },
                { id: tattoo, name: "Tattoos", kind: "tattoo", active: false },
              ],
              approvals,
            },
          });
        }
      });
      await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
      await expect(
        page.getByRole("heading", { name: "Future services: provider checks" }),
      ).toBeVisible();
      expect(reads).toBe(0);
      await page
        .getByRole("button", { name: "Open provider checks", exact: true })
        .click();
      await page.getByLabel("Professional", { exact: true }).selectOption(pro);
      await page
        .getByLabel("GDC registration number", { exact: true })
        .fill("123456");
      await page
        .getByLabel("Approval expires", { exact: true })
        .fill("2027-01-01");
      await page
        .getByLabel("I checked current registration/licensing evidence.", {
          exact: true,
        })
        .check();
      await page
        .getByLabel("I checked insurance covering this service.", {
          exact: true,
        })
        .check();
      await page.getByLabel(/I reviewed training/).check();
      await page
        .getByLabel(
          "The GDC register confirms this professional is a dentist.",
          { exact: true },
        )
        .check();
      await page
        .getByLabel("Review reason and evidence references", { exact: true })
        .fill("Verified fictional evidence for this isolated fixture.");
      page.once("dialog", (dialog) => dialog.dismiss());
      await page
        .getByRole("button", {
          name: "Save verified provider approval",
          exact: true,
        })
        .click();
      expect(writes).toHaveLength(0);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", {
          name: "Save verified provider approval",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Your decision was saved, but the list could not refresh",
      );
      expect(writes).toHaveLength(1);
      await expect(
        page.getByLabel("Future category", { exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", {
          name: "Save verified provider approval",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Refresh provider checks", exact: true })
        .click();
      await expect(page.getByText(/Recorded approval: approved/)).toBeVisible();
      expect(writes).toHaveLength(1);
      await page
        .getByLabel("GDC registration number", { exact: true })
        .fill("");
      await page.getByLabel("Approval expires", { exact: true }).fill("");
      await page
        .getByLabel("I checked insurance covering this service.", {
          exact: true,
        })
        .uncheck();
      await page
        .getByLabel("Review reason and evidence references", { exact: true })
        .fill("Revoke the fictional approval after evidence expires.");
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Revoke approval", exact: true })
        .click();
      await expect(page.getByText(/Recorded approval: revoked/)).toBeVisible();
      expect(writes).toHaveLength(2);
      expect(writes[1].status).toBe("revoked");
      expect(writes[1].registrationReference).toBeUndefined();
      await page
        .getByLabel("Future category", { exact: true })
        .selectOption(tattoo);
      await expect(
        page.getByLabel(
          "Provider and premises registration/licence references",
          { exact: true },
        ),
      ).toHaveValue("");
      await expect(
        page.getByLabel(
          "The GDC register confirms this professional is a dentist.",
          { exact: true },
        ),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `reports/service-safeguards-${theme}-${width}.png`,
          fullPage: true,
        });
      results.push({
        theme,
        width,
        lazyRead: true,
        confirmation: true,
        savedRefreshFailure: true,
        reasonOnlyRevoke: true,
        draftReset: true,
        passed: true,
      });
      await page.close();
    }
  await writeFile(
    "reports/service-safeguards-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
