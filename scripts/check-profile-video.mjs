// Isolated, playable media and fictional profiles. No production mutations.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/profile-video-entry.tsx";
const { server } = await import("./ui-audit.mjs");
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=s=320x400:d=4", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "reports/profile-video-fixture.mp4"], { stdio: "ignore" });
const clip = await readFile("reports/profile-video-fixture.mp4");
const browser = await chromium.launch({
  ...(process.env.GLOHAUS_TEST_BROWSER ? { executablePath: process.env.GLOHAUS_TEST_BROWSER } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
try {
  for (const theme of ["light", "night"]) for (const width of [390, 1440]) {
    console.log(`Checking ${theme} at ${width}px`);
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.route("**/api/media/*", route => route.fulfill({ contentType: "video/mp4", body: clip }));
    await page.goto(`http://127.0.0.1:3004/profile?theme=${theme}`);
    const section = page.locator("#about");
    expect(await section.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(20);
    expect(await section.locator("h2").evaluate(el => getComputedStyle(el).fontFamily)).not.toMatch(/Georgia/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/profile-video-layout-${theme}-${width}.png`, fullPage: true });
    await page.locator(".viewport-video").first().scrollIntoViewIfNeeded();
    // A grid can show two equally visible clips. Verify the selected clip, not
    // an assumed tile index; the user-facing contract is one autoplaying video.
    await expect.poll(() => page.locator("video").evaluateAll(videos => videos.filter(v => !v.paused && v.currentTime > 0).length)).toBe(1);
    const activeIndex = await page.locator("video").evaluateAll(videos => videos.findIndex(v => !v.paused));
    const player = page.locator(".viewport-video").nth(activeIndex);
    const video = player.locator("video");
    await expect.poll(() => video.evaluate(el => !el.paused && el.currentTime > 0)).toBe(true);
    expect(await page.locator("video").evaluateAll(videos => videos.filter(v => !v.paused).length)).toBe(1);
    await player.getByRole("button", { name: /^Pause video:/ }).click();
    await expect.poll(() => video.evaluate(el => el.paused)).toBe(true);
    await player.getByRole("button", { name: /^Play video:/ }).press("Space");
    await expect.poll(() => video.evaluate(el => el.paused)).toBe(false);
    await player.getByRole("button", { name: /^Unmute video:/ }).click();
    expect(await video.evaluate(el => el.muted)).toBe(false);
    // Provide scroll room even when this short fictional profile fits the screen.
    await page.evaluate(() => { document.getElementById("root").style.paddingBottom = "1200px"; window.scrollTo(0, document.documentElement.scrollHeight); });
    await expect.poll(() => page.locator("video").evaluateAll(videos => videos.every(v => v.paused))).toBe(true);
    await page.goto(`http://127.0.0.1:3004/discover?theme=${theme}`);
    const feedPlayer = page.locator(".viewport-video").first();
    const feedVideo = feedPlayer.locator("video");
    await expect.poll(() => feedVideo.evaluate(el => !el.paused && el.currentTime > 0)).toBe(true);
    await feedPlayer.getByRole("button", { name: /^Unmute video:/ }).click();
    expect(await feedVideo.evaluate(el => el.muted)).toBe(false);
    await page.locator(".community-slide").first().locator(".post-reader summary").click();
    await expect(page.locator(".community-slide").first().locator(".post-reader")).toHaveAttribute("open", "");
    expect(await feedVideo.evaluate(el => el.paused)).toBe(false);
    await page.locator(".community-slide").first().locator(".post-reader summary").click();
    await feedPlayer.getByRole("button", { name: /^Pause video:/ }).click({ position: { x: 100, y: 160 } });
    await expect.poll(() => feedVideo.evaluate(el => el.paused)).toBe(true);
    await feedPlayer.getByRole("button", { name: /^Play video:/ }).click({ position: { x: 100, y: 160 } });
    await expect.poll(() => feedVideo.evaluate(el => el.paused)).toBe(false);
    await page.locator(".feed-scroll").evaluate(el => el.scrollTop = el.clientHeight);
    const nextVideo = page.locator(".viewport-video").nth(1).locator("video");
    await expect.poll(() => nextVideo.evaluate(el => !el.paused && el.currentTime > 0)).toBe(true);
    expect(await feedVideo.evaluate(el => el.paused)).toBe(true);
    await page.screenshot({ path: `reports/profile-video-discover-${theme}-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
    results.push({ theme, width, profileSpacing: true, noOverflow: true, actualPlayback: true, tapPause: true, keyboardResume: true, sound: true, scrollPause: true, onePlayingClip: true });
    await page.close();
  }
  await writeFile("reports/profile-video-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
