// Uses real UI components with fictional data and locally mocked fetch only.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { server } from "./ui-audit.mjs";
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
const image = { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64") };
try {
  for (const role of ["owner", "admin"]) for (const theme of ["light", "night"]) for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.goto(`http://127.0.0.1:3004/admin?role=${role}&theme=${theme}`);
    await page.locator(".admin-workspace").waitFor();
    async function submit(form, button) {
      for (const field of await form.locator('input[required]:not([type="checkbox"]),textarea[required]').all()) {
        if (!await field.inputValue()) await field.fill("Isolated audit change");
      }
      const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem("audit-requests") || "[]").length);
      await form.getByRole("button", { name: button, exact: true }).click();
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("audit-requests") || "[]").length)).toBe(before + 1);
    }
    await submit(page.locator("#settings form"), "Save display names");
    await page.locator("#categories").getByRole("button", { name: "Add category", exact: true }).click();
    const category = page.locator("#categories form");
    await category.locator('[name="name"]').fill("Massage");
    await submit(category, "Create category");
    await page.locator("#categories").getByRole("button", { name: "Edit Massage", exact: true }).click();
    await submit(category, "Save changes");
    await page.locator("#categories").getByRole("button", { name: "Hide Massage", exact: true }).click();
    await submit(page.locator('form').filter({ has: page.getByRole("button", { name: "Save LIVE access", exact: true }) }), "Save LIVE access");
    for (const [name, index] of [["Manage status", 0], ["Moderate", 0], ["Moderate", 1], ["Review", 0], ["Review", 1]]) {
      await page.getByRole("button", { name, exact: true }).nth(index).click();
      const decision = page.locator("form").filter({ has: page.getByRole("button", { name: "Save decision", exact: true }) });
      await expect(decision.locator("select")).toBeFocused();
      await submit(decision, "Save decision");
    }
    await page.getByLabel("Search users and professionals").fill("Alex");
    await expect(page.getByText("1 of 2 accounts shown")).toBeVisible();
    await page.getByLabel("Search users and professionals").fill("");
    if (role === "owner") {
      const search = page.getByRole("textbox", { name: "Search Owner controls" });
      await search.fill("Homepage");
      await page.locator(".owner-search-results").getByRole("button", { name: /Homepage images/ }).click();
      await expect(page).toHaveURL(/#homepage-media$/);
      await page.locator("#website-status").getByRole("button", { name: "Turn website OFF" }).click();
      await expect(page.locator("#website-status").getByRole("button", { name: "Turn website ON" })).toBeVisible();
      await submit(page.locator("#booking-fee form"), "Update booking fee");
      await submit(page.locator("#shop-fees form"), "Update Shop commission");
      await submit(page.locator("#professional-commission form"), "Set custom rate");
      await page.locator("#homepage-media").getByLabel("Desktop homepage image", { exact: true }).setInputFiles(image);
      await expect(page.getByRole("img", { name: "Desktop homepage model preview" })).toBeVisible();
      await page.locator("#homepage-media").getByLabel("Mobile homepage image", { exact: true }).setInputFiles(image);
      await expect(page.getByRole("img", { name: "Mobile homepage model preview" })).toBeVisible();
      await submit(page.locator("#homepage-media form"), "Save homepage images");
      await page.getByRole("button", { name: "Use GLOHAUS defaults" }).click();
      await submit(page.locator("#homepage-media form"), "Save homepage images");
      const add = page.locator("#staff form").filter({ has: page.getByRole("button", { name: "Add admin", exact: true }) });
      await add.locator("select").selectOption("11111111-1111-4111-8111-111111111111");
      await submit(add, "Add admin");
      await page.getByRole("button", { name: "Remove admin", exact: true }).click();
      await submit(page.locator("#staff form").filter({ has: page.getByRole("button", { name: "Confirm change", exact: true }) }), "Confirm change");
      await page.getByRole("button", { name: "Grant admin", exact: true }).first().click();
      await submit(page.locator("#staff form").filter({ has: page.getByRole("button", { name: "Confirm change", exact: true }) }), "Confirm change");
      await page.getByRole("button", { name: "Restrict", exact: true }).first().click();
      await submit(page.locator(".owner-account-action-popover"), "Apply restriction");
      for (const launch of await page.getByRole("button", { name: "Launch preset", exact: true }).all()) await launch.click();
      await submit(page.locator("#marketing form"), "Publish private vote");
      await expect(page.locator(".owner-marketing-panel").getByRole("status")).toContainText("published for 7 day(s)");
    }
    const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem("audit-requests") || "[]"));
    results.push({ role, theme, width, errors, actions: requests.map(request => ({ url: request.url, payload: JSON.parse(request.body || "{}") })) });
    console.log(`${role} ${theme} ${width}: ${requests.length} actions, ${errors.length} browser errors`);
    await page.close();
  }
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3004/admin?response=mfa");
  await page.locator("#booking-fee input[name=reason]").fill("Isolated audit");
  await page.getByRole("button", { name: "Update booking fee" }).click();
  await expect(page.getByText("Your security verification has expired. Open Security, verify your account, then retry this change.", { exact: true })).toBeVisible();
  await expect(page.locator('.admin-navigation-bottom a[href="/security"]')).toBeVisible();
  await page.close();
  for (const theme of ["light", "night"]) for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`http://127.0.0.1:3004/photo?theme=${theme}`);
    await page.getByLabel("Profile image", { exact: true }).setInputFiles(image);
    await expect(page.getByRole("img", { name: "Professional profile photo" })).toHaveAttribute("src", /^data:image/);
    expect(await page.evaluate(() => sessionStorage.getItem("audit-requests"))).toBeNull();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save profile photo", exact: true }).click();
    await expect(page.getByText("Profile photo saved.", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Professional profile photo" })).toHaveAttribute("src", /^\/api\/media\//);
    await page.getByRole("button", { name: "Remove photo", exact: true }).click();
    await expect(page.getByText("Profile photo removed.", { exact: true })).toBeVisible();
    results.push({ profilePhoto: true, theme, width });
    await page.close();
  }
  await writeFile("reports/ui-control-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(({ role, theme, width, errors, actions, profilePhoto }) => ({ role, theme, width, errors, actionCount: actions?.length, profilePhoto }))));
  if (results.some(result => result.errors?.length)) process.exitCode = 1;
} finally { await browser.close(); server.close(); }
