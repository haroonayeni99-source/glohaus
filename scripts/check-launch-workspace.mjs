// Focused Owner/Admin navigation, search and confirmation checks. Mutations are local fixtures.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { server } from "./ui-audit.mjs";
const browser = await chromium.launch({
  executablePath: process.env.GLOHAUS_TEST_BROWSER,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  for (const role of ["owner", "admin"])
    for (const theme of ["light", "night"])
      for (const width of [320, 390, 820, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        async function goToSection(id) {
          if (width <= 880) {
            await page
              .getByLabel("Go to section", { exact: true })
              .selectOption(id);
          } else {
            const link = page.locator(`.admin-navigation nav a[href="#${id}"]`);
            if (!(await link.isVisible()))
              await page
                .locator(".admin-tool-group")
                .filter({ has: link })
                .getByRole("button")
                .click();
            await link.click();
          }
        }
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
          route.abort(),
        );
        await page.goto(
          `http://127.0.0.1:3004/admin?role=${role}&theme=${theme}`,
        );
        await page.locator("#overview").waitFor();
        await page.addStyleTag({
          content: "html { scroll-behavior: auto !important; }",
        });
        await expect(page.locator("#categories")).not.toBeVisible();
        const sections = await page
          .locator(".admin-section-picker option")
          .evaluateAll((options) => options.map((option) => option.value));
        if (width > 880) {
          const group = page.getByRole("button", { name: /^People & access/ });
          await expect(group).toHaveAttribute("aria-expanded", "false");
          await group.click();
          await expect(
            page.locator('.admin-navigation nav a[href="#users"]'),
          ).toBeVisible();
          await group.click();
          await expect(
            page.locator('.admin-navigation nav a[href="#users"]'),
          ).not.toBeVisible();
        }
        for (const id of sections) {
          await goToSection(id);
          await expect(page.locator(`#${id}`)).toBeVisible();
          expect(
            await page
              .locator(".admin-workspace-section:visible, #overview:visible")
              .count(),
          ).toBe(1);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(1);
        }
        await goToSection("support");
        await expect(
          page.getByText("Fixture Support Customer", { exact: false }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Open case / reply", exact: true })
          .click();
        const supportForm = page
          .locator("#support form")
          .filter({ has: page.getByLabel("Reason / reply", { exact: true }) });
        await supportForm
          .locator('select[name="status"]')
          .selectOption("resolved");
        await supportForm
          .getByLabel("Reason / reply", { exact: true })
          .fill("Reviewed the evidence and explained the support decision");
        await supportForm
          .getByRole("button", {
            name: "Save response and status",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: "Case history updated" }),
        ).toBeVisible();
        await expect(
          page.getByText(
            "Reviewed the evidence and explained the support decision",
            { exact: true },
          ),
        ).toBeVisible();
        await supportForm.locator('select[name="status"]').selectOption("open");
        await supportForm
          .getByLabel("Reason / reply", { exact: true })
          .fill("Customer supplied new evidence, so the case was reopened");
        await supportForm
          .getByRole("button", {
            name: "Save response and status",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(
            "Customer supplied new evidence, so the case was reopened",
            { exact: true },
          ),
        ).toBeVisible();
        await supportForm
          .getByLabel("Reason / reply", { exact: true })
          .fill("Unsaved support draft stays here");
        await goToSection("bookings");
        await goToSection("support");
        await expect(
          supportForm.getByLabel("Reason / reply", { exact: true }),
        ).toHaveValue("Unsaved support draft stays here");
        const supportChanges = await page.evaluate(() =>
          JSON.parse(sessionStorage.getItem("audit-requests") || "[]").filter(
            (request) => request.url.includes("/admin/support/"),
          ),
        );
        expect(
          supportChanges.map((request) => ({
            method: request.method,
            status: JSON.parse(request.body).status,
          })),
        ).toEqual([
          { method: "PATCH", status: "resolved" },
          { method: "PATCH", status: "open" },
        ]);
        expect(
          supportChanges.every(
            (request) => JSON.parse(request.body).note.length >= 5,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: `reports/launch-support-${role}-${theme}-${width}.png`,
        });
        await goToSection("users");
        await page.getByLabel("Search users and professionals").fill("Alex");
        await expect(page.getByText("1 of 2 accounts shown")).toBeVisible();
        if (role === "owner") {
          // A global result must reveal accounts hidden by an earlier section filter.
          await page.getByLabel("Search Owner controls").fill("Maya Studio");
          await page.locator(".owner-search-results button").first().click();
          // Search reveals the selected record after two animation frames.
          // Wait for navigation before filtering that record out again.
          await expect(page).toHaveURL(
            /#user-11111111-1111-4111-8111-111111111111$/,
          );
          await expect(
            page.getByLabel("Search users and professionals"),
          ).toHaveValue("");
          await expect(page.locator("#users")).toBeVisible();
          await page.getByLabel("Search users and professionals").fill("Alex");
        }
        await page
          .getByRole("button", { name: "Manage status", exact: true })
          .click();
        const decision = page.locator(".admin-decision-form");
        await decision
          .locator('[name="reason"]')
          .fill("Isolated confirmation check");
        const before = await page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem("audit-requests") || "[]").length,
        );
        page.once("dialog", (dialog) => dialog.dismiss());
        await decision
          .getByRole("button", { name: "Save decision", exact: true })
          .click();
        expect(
          await page.evaluate(
            () =>
              JSON.parse(sessionStorage.getItem("audit-requests") || "[]")
                .length,
          ),
        ).toBe(before);
        await expect(decision).toBeVisible();
        page.once("dialog", (dialog) => dialog.accept());
        await decision
          .getByRole("button", { name: "Save decision", exact: true })
          .click();
        await expect(
          page.getByText("Change saved and recorded in the audit log.", {
            exact: true,
          }),
        ).toBeVisible();
        await goToSection("bookings");
        await page
          .locator('#bookings input[type="search"]')
          .fill("not-a-booking");
        await expect(page.locator("#bookings [role=status]")).toHaveText(
          "No matching records. Try another search or clear the filter.",
        );
        await expect(
          page.locator("#bookings .service-edit-row"),
        ).not.toBeVisible();
        await page.locator('#bookings input[type="search"]').fill("");
        await expect(page.locator("#bookings .service-edit-row")).toBeVisible();
        await page
          .getByRole("button", { name: "Show all sections", exact: true })
          .click();
        await expect(page.locator("#categories")).toBeVisible();
        await page
          .getByRole("button", { name: "Focus one section", exact: true })
          .click();
        await expect(page.locator("#bookings")).toBeVisible();
        if (width > 880) {
          await page
            .getByLabel("Find a tool", { exact: true })
            .fill("categories");
          await expect(page.locator(".admin-navigation nav a")).toHaveCount(2);
          await expect(
            page.locator('.admin-navigation nav a[href="#categories"]'),
          ).toBeVisible();
          await expect(
            page.locator('.admin-navigation nav a[href="#product-categories"]'),
          ).toBeVisible();
          await page.getByLabel("Find a tool", { exact: true }).fill("");
          await page
            .getByRole("button", { name: "Minimise administration menu" })
            .click();
          await page
            .getByRole("button", { name: "Expand administration menu" })
            .click();
        }
        await page
          .getByLabel("Find a tool", { exact: true })
          .fill("customer complaint");
        await expect(
          page.locator('.admin-navigation nav a[href="#support"]'),
        ).toBeVisible();
        await page.locator('.admin-navigation nav a[href="#support"]').click();
        await expect(page.locator("#support .admin-tool-help")).toContainText(
          "Gmail replies are not synchronised",
        );
        await page
          .getByLabel("Find a tool", { exact: true })
          .fill("nothing-matches-this-task");
        await expect(page.locator(".admin-navigation nav")).toContainText(
          "No tools match",
        );
        await page.getByLabel("Find a tool", { exact: true }).fill("");
        await goToSection("overview");
        await page.locator('.admin-quick-actions a[href="#support"]').click();
        await expect(page.locator("#support")).toBeVisible();
        await page
          .getByLabel("Search Owner controls")
          .fill("customer complaint");
        await page
          .locator(".owner-search-results button")
          .filter({ hasText: "Support & Disputes" })
          .click();
        await expect(page.locator("#support")).toBeVisible();
        if (role === "owner") {
          await goToSection("professional-commission");
          const draft = page.locator(
            '#professional-commission input[name="professionalBasisPoints"]',
          );
          await expect(draft).toHaveValue("2");
          await draft.fill("3.25");
          await goToSection("founding-programme");
          await expect(page.locator("#founding-programme")).toContainText(
            "Status: open",
          );
          await expect(draft).not.toBeVisible();
          await goToSection("professional-commission");
          await expect(draft).toHaveValue("3.25");
          await expect(page.locator("#professional-commission")).toContainText(
            "Draft only — inactive",
          );
        }
        if (role === "admin") {
          expect(sections).not.toContain("professional-commission");
          expect(sections).not.toContain("staff");
        }
        expect(errors).toEqual([]);
        console.log(
          `${role} ${theme} ${width}: ${sections.length} sections checked`,
        );
        results.push({
          role,
          theme,
          width,
          sections: sections.length,
          confirmationCancel: true,
          search: true,
          errors,
        });
        await page.screenshot({
          path: `reports/launch-${role}-${theme}-${width}.png`,
        });
        await page.close();
      }
  await writeFile(
    "reports/launch-workspace-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(`${results.length} focused workspace cases passed`);
} finally {
  await browser.close();
  server.close();
}
