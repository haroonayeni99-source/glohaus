// Production-build browser checks on an isolated local origin. No credentials,
// real accounts, payments, email or push-provider requests are used.
import { chromium, webkit, devices, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = 3015,
  base = `http://127.0.0.1:${port}`;
const originalWorker = await readFile("public/sw.js", "utf8");
let serverLog = "";
function startServer() {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NEXT_PUBLIC_APP_URL: base,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      serverLog = (serverLog + chunk).slice(-12000);
    });
  return child;
}
let server = startServer();
async function stopServer() {
  const old = server;
  const stopped = new Promise((resolve) => old.once("exit", resolve));
  old.kill("SIGTERM");
  await stopped;
}
async function ready() {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/install`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 50000 },
    )
    .toBe(200);
}
const results = [],
  browsers = [],
  persistentContexts = [],
  temporaryProfiles = [];
await mkdir("reports", { recursive: true });
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/install`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 50000 },
    )
    .toBe(200);
  const chrome = await chromium.launch({
    headless: true,
    executablePath: process.env.GLOHAUS_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const safari = await webkit.launch({ headless: true });
  browsers.push(chrome, safari);
  for (const [name, browser, profile] of [
    ["desktop", chrome, { viewport: { width: 1365, height: 1000 } }],
    ["android", chrome, devices["Pixel 7"]],
    ["iphone-webkit", safari, devices["iPhone 13"]],
  ])
    for (const theme of ["light", "night"]) {
      const options = {
        ...profile,
        colorScheme: theme === "night" ? "dark" : "light",
      };
      // Installation is deliberately unavailable in incognito contexts. Check
      // real desktop installability with a disposable normal profile instead
      // of ignoring Chrome's in-incognito error or weakening the assertion.
      let context;
      if (name === "desktop") {
        const directory = await mkdtemp(join(tmpdir(), "glohaus-pwa-"));
        temporaryProfiles.push(directory);
        context = await chromium.launchPersistentContext(directory, {
          ...options,
          executablePath: process.env.GLOHAUS_CHROMIUM_PATH || undefined,
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        persistentContexts.push(context);
      } else {
        context = await browser.newContext(options);
      }
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        (value) => localStorage.setItem("glohaus-theme", value),
        theme,
      );
      await page.goto(`${base}/install`);
      await expect(
        page.getByRole("heading", { name: "GLOHAUS on your Home Screen." }),
      ).toBeVisible();
      await expect(page.getByText(/Enable Open as Web App/)).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "Customer notification settings",
          exact: true,
        }),
      ).toHaveAttribute("href", "/account/notifications");
      const manifest = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]');
        return {
          url: link.href,
          data: await (await fetch(link.href)).json(),
          viewport: document.querySelector('meta[name="viewport"]').content,
          apple: document.querySelector('link[rel="apple-touch-icon"]').href,
        };
      });
      expect(manifest.data).toMatchObject({
        id: "/",
        name: "GLOHAUS",
        short_name: "GLOHAUS",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#fcfbf9",
        background_color: "#fcfbf9",
      });
      expect(manifest.viewport).toContain("viewport-fit=cover");
      const themeColor = theme === "night" ? "#171415" : "#fcfbf9";
      await expect.poll(() => page.locator('meta[name="theme-color"]').evaluateAll(metas => [...new Set(metas.map(meta => meta.content))])).toEqual([themeColor]);
      await page.locator(".theme-toggle").click();
      const oppositeColor = theme === "night" ? "#fcfbf9" : "#171415";
      await expect.poll(() => page.locator('meta[name="theme-color"]').evaluateAll(metas => [...new Set(metas.map(meta => meta.content))])).toEqual([oppositeColor]);
      await page.reload();
      await expect.poll(() => page.locator('meta[name="theme-color"]').evaluateAll(metas => [...new Set(metas.map(meta => meta.content))])).toEqual([oppositeColor]);
      await page.locator(".theme-toggle").click();
      await expect.poll(() => page.locator('meta[name="theme-color"]').evaluateAll(metas => [...new Set(metas.map(meta => meta.content))])).toEqual([themeColor]);
      expect(manifest.data.icons.map((icon) => icon.src)).toEqual([
        "/icons/glohaus-home-192-v2.png",
        "/icons/glohaus-home-512-v2.png",
        "/icons/glohaus-home-maskable-512-v2.png",
      ]);
      const dimensions = await page.evaluate(async () => {
        return Promise.all(
          [
            "/icons/glohaus-home-192-v2.png",
            "/icons/glohaus-home-512-v2.png",
            "/icons/glohaus-home-apple-180-v2.png",
            "/icons/glohaus-home-maskable-512-v2.png",
          ].map(
            (src) =>
              new Promise((resolve) => {
                const i = new Image();
                i.onload = () => resolve([i.naturalWidth, i.naturalHeight]);
                i.onerror = () => resolve(null);
                i.src = src;
              }),
          ),
        );
      });
      expect(dimensions).toEqual([
        [192, 192],
        [512, 512],
        [180, 180],
        [512, 512],
      ]);
      expect(manifest.apple).toContain("/icons/glohaus-home-apple-180-v2.png");
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((resolve) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              resolve,
              { once: true },
            ),
          );
      });
      expect(
        await page.evaluate(
          async () => (await navigator.serviceWorker.getRegistrations()).length,
        ),
      ).toBe(1);
      if (name === "desktop") {
        const cdp = await context.newCDPSession(page);
        const actual = await cdp.send("Page.getAppManifest");
        expect(actual.errors).toEqual([]);
        expect(JSON.parse(actual.data).start_url).toBe("/");
        const installability = await cdp.send("Page.getInstallabilityErrors");
        expect(installability.installabilityErrors).toEqual([]);
        await cdp.detach();
      }
      await context.addCookies([
        {
          name: "pwa-session-probe",
          value: "opaque-test-only",
          url: base,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.reload();
      expect(
        (await context.cookies()).some((c) => c.name === "pwa-session-probe"),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `reports/pwa-${name}-${theme}.png`,
        fullPage: true,
      });
      // Playwright 1.63 WebKit kills SW-fulfilled requests before dispatch when
      // setOffline(true) is used: microsoft/playwright#42775. Stop the actual
      // local origin instead, retaining all fallback/status/cache assertions.
      if (name === "iphone-webkit") await stopServer();
      else await context.setOffline(true);
      const offline = await page.goto(
        `${base}/account/bookings/offline-fixture`,
        { waitUntil: "domcontentloaded" },
      );
      expect(offline.status()).toBe(503);
      expect(offline.fromServiceWorker()).toBe(true);
      await expect(
        page.getByRole("heading", { name: "You’re offline." }),
      ).toBeVisible();
      await expect(
        page.getByText(/No live booking or payment status/),
      ).toBeVisible();
      const apiFailed = await page.evaluate(async () => {
        try {
          await fetch("/api/v1/account/notification-settings");
          return false;
        } catch {
          return true;
        }
      });
      expect(apiFailed).toBe(true);
      const cached = await page.evaluate(async () =>
        (
          await Promise.all(
            (await caches.keys()).map(async (key) =>
              (await (await caches.open(key)).keys()).map(
                (r) => new URL(r.url).pathname,
              ),
            ),
          )
        ).flat(),
      );
      expect(cached.sort()).toEqual(
        [
          "/offline.html",
          "/icons/glohaus-192.png",
          "/icons/glohaus-512.png",
          "/icons/apple-touch-icon.png",
          "/icons/glohaus-maskable-512.png",
          "/icons/glohaus-home-192-v2.png",
          "/icons/glohaus-home-512-v2.png",
          "/icons/glohaus-home-apple-180-v2.png",
          "/icons/glohaus-home-maskable-512-v2.png",
        ].sort(),
      );
      await page.screenshot({
        path: `reports/pwa-offline-${name}-${theme}.png`,
        fullPage: true,
      });
      if (name === "iphone-webkit") {
        server = startServer();
        await ready();
      } else await context.setOffline(false);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "You’re offline." }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      results.push({
        name: `${name} ${theme}: manifest/icons, installation help, cookie persistence, private offline fallback and reconnection`,
        passed: true,
      });
      await context.close();
    }
  const context = await chrome.newContext(),
    page = await context.newPage();
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
    window.pwaUnsavedProbe = "unsaved";
  });
  await writeFile(
    "public/sw.js",
    originalWorker + "\n// isolated browser upgrade fixture\n",
  );
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration("/");
    await r.update();
  });
  await expect(
    page.getByText("A GLOHAUS update is ready", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => window.pwaUnsavedProbe)).toBe("unsaved");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Reload to update", exact: true })
    .click();
  expect(await page.evaluate(() => window.pwaUnsavedProbe)).toBe("unsaved");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reload to update", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => window.pwaUnsavedProbe).catch(() => "navigating"),
      { timeout: 15000 },
    )
    .toBeUndefined();
  results.push({
    name: "Worker update waits, cancel preserves work, explicit confirmation activates and reloads",
    passed: true,
  });
  await context.close();
  await writeFile(
    "reports/pwa-results.json",
    JSON.stringify({ physicalDevicesTested: false, results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(serverLog);
  for (const [i, context] of [
    ...browsers.flatMap((browser) => browser.contexts()),
    ...persistentContexts.filter((context) => context.pages().length),
  ].entries())
    for (const [j, page] of context.pages().entries())
      await page
        .screenshot({
          path: `reports/pwa-failed-${i}-${j}.png`,
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await writeFile("public/sw.js", originalWorker);
  await Promise.all(
    persistentContexts.map((context) => context.close().catch(() => {})),
  );
  await Promise.all(browsers.map((b) => b.close()));
  await Promise.all(
    temporaryProfiles.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  if (server.exitCode === null && server.signalCode === null)
    server.kill("SIGTERM");
}
