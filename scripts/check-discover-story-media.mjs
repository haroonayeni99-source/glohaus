import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/discover-story-media-entry.tsx";
process.env.GLOHAUS_UI_AUDIT_MOCK_BLOB = "1";
const { server } = await import("./ui-audit.mjs");
// Small playable local clip; the upload's size is simulated for the multipart check.
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=pink:s=160x160:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "reports/media-fixture.mp4"], { stdio: "ignore" });
const video = await readFile("reports/media-fixture.mp4");
const image = await sharp({ create: { width: 2000, height: 1600, channels: 3, background: "#cb728e" } }).png({ compressionLevel: 0 }).toBuffer();
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] }); const results = [];
try {
  for (const theme of ["light", "night"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.route("**/api/media/*", async route => {
      const assets = await page.evaluate(() => JSON.parse(sessionStorage.getItem("assets") || "[]"));
      const asset = assets.find(a => route.request().url().endsWith(a.id));
      await route.fulfill({ contentType: asset?.media_type === "video" ? "video/mp4" : "image/png", body: asset?.media_type === "video" ? video : image });
    });
    await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
    for (const context of ["post", "story"]) {
      const editor = page.locator(`#${context}-editor`);
      for (const kind of ["image", "video"]) {
        const input = editor.getByLabel("Choose photo or video");
        if (kind === "image") await input.setInputFiles({ name: "large-photo.png", mimeType: "image/png", buffer: image });
        else await input.evaluate((el, bytes) => {
          const file = new File([new Uint8Array(bytes)], "work.mp4", { type: "video/mp4" });
          Object.defineProperty(file, "size", { value: 100 * 1024 * 1024 });
          const transfer = new DataTransfer(); transfer.items.add(file); el.files = transfer.files; el.dispatchEvent(new Event("change", { bubbles: true }));
        }, [...video]);
        const save = editor.getByRole("button", { name: context === "post" ? "Save post" : "Add to Story", exact: true });
        await expect(save).toBeDisabled();
        await expect(editor.getByRole("button", { name: "Upload and attach", exact: true })).toBeEnabled();
        await editor.getByLabel("Media description").fill(context === "post" ? "" : `${kind} of finished work`);
        await editor.getByRole("button", { name: "Upload and attach", exact: true }).click();
        await expect(editor.getByText("Media attached privately. Publish your post or Story when you are ready.", { exact: true })).toBeVisible();
        if (context === "post") {
          await editor.getByLabel("Title", { exact: true }).fill(`${kind} work`);
          await editor.getByLabel("Your story or tutorial").fill("A finished beauty treatment from our studio today.");
          await editor.getByLabel("Visibility").selectOption("published");
          if (kind === "image") {
            await page.evaluate(() => sessionStorage.setItem("fail-post", "1")); await save.click();
            await expect(editor.getByRole("status", { name: "" }).filter({ hasText: "Could not save" })).toBeVisible();
          }
        } else await editor.getByLabel("What are you doing?").fill(`${kind} work today`);
        await save.click();
        await expect(editor.getByText(context === "post" ? "Post saved." : "Story is live for 24 hours.", { exact: true })).toBeVisible();
      }
    }
    const requests = await page.evaluate(() => JSON.parse(sessionStorage.getItem("requests")));
    expect(requests.filter(r => r.url === "/api/v1/professional/portfolio")).toHaveLength(2);
    for (const r of requests.filter(r => r.url === "/api/v1/professional/portfolio")) expect(Buffer.from(r.body.base64, "base64").length).toBeLessThanOrEqual(3 * 1024 * 1024);
    const uploads = await page.evaluate(() => JSON.parse(sessionStorage.getItem("video-uploads")));
    expect(uploads).toHaveLength(2); for (const u of uploads) expect(u).toMatchObject({ size: 100 * 1024 * 1024, multipart: true, access: "private", contentType: "video/mp4" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/discover-story-editors-${theme}-${width}.png`, fullPage: true });
    await page.goto(`http://127.0.0.1:3004/discover?theme=${theme}`);
    await expect(page.getByRole("link", { name: "Post / Story" })).toHaveAttribute("href", "/professional/posts");
    await expect(page.locator(".community-slide video")).toHaveCount(1);
    await expect(page.locator(".community-slide img")).toHaveCount(1);
    await expect(page.locator(".story-bubble")).toHaveCount(2);
    await page.locator(".story-bubble").last().click();
    const player = page.getByRole("dialog").locator("video");
    await expect(player).toBeVisible(); await expect.poll(() => player.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: "Close Story" }).click();
    await page.locator(".story-bubble").first().click(); await expect(page.getByRole("dialog").locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Close Story" }).click();
    expect(errors).toEqual([]); results.push({ theme, width, directPhotoAndVideoPosts: true, directPhotoAndVideoStories: true, multipart: true, retry: true, discoverStoryPlayback: true });
    await page.close();
  }
  await writeFile("reports/discover-story-media-results.json", JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
