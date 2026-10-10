// Render real public pages and authenticated components using isolated fixture data.
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { open, mkdir, writeFile, readFile } from "node:fs/promises";
const baseline = process.argv.includes("--baseline");
await mkdir("reports", { recursive: true });
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/mobile-audit/entry.tsx";
const { server } = await import("./ui-audit.mjs");
const log = await open("reports/mobile-next.log", "w");
// Next development generates these files; preserve repository instructions/types.
const generatedFiles = await Promise.all(
  ["AGENTS.md", "next-env.d.ts"].map(async (path) => ({
    path,
    content: await readFile(path),
  })),
);
const next = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3006",
  ],
  {
    stdio: ["ignore", log.fd, log.fd],
    env: {
      ...process.env,
      DATABASE_URL: "",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3006",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
);
let browser;
const findings = [];
try {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3006/");
      if (r.ok) break;
    } catch {}
    if (i === 119) throw new Error("Local public server did not start");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({
    executablePath: process.env.GLOHAUS_TEST_BROWSER,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const groups = [
    {
      base: "http://127.0.0.1:3006",
      kind: "public",
      paths: [
        "/",
        "/explore",
        "/discover",
        "/share",
        "/shop",
        "/about",
        "/faq",
        "/how-it-works",
        "/professional-preview",
        "/customer-preview",
        "/sign-up",
        "/terms",
        "/privacy",
        "/refunds",
      ],
    },
    {
      base: "http://127.0.0.1:3004",
      kind: "fixture",
      paths: [
        "/",
        "/account",
        "/professional",
        "/professional/tools",
        "/professional/profile",
        "/professional/services",
        "/professional/availability",
        "/professional/products",
        "/professional/orders",
        "/professional/bookings",
        "/p/fictional-studio",
        "/cart",
        "/explore",
        "/admin",
      ],
    },
  ];
  for (const group of groups)
    for (const path of group.paths) {
      for (const theme of baseline ? ["light"] : ["light", "night"])
        for (const width of baseline ? [320, 390] : [320, 390, 768, 1440]) {
          const page = await browser.newPage({
            viewport: { width, height: 844 },
          });
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.addInitScript(
            (value) => localStorage.setItem("glohaus-theme", value),
            theme,
          );
          await page.route("**/*", (route) => {
            const url = new URL(route.request().url());
            if (url.hostname !== "127.0.0.1") return route.abort();
            if (route.request().resourceType() === "image")
              return route.fulfill({
                contentType: "image/svg+xml",
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
              });
            return route.continue();
          });
          await page.goto(
            `${group.base}${path}?theme=${theme}&role=${path.startsWith("/professional") ? "professional" : path === "/admin" ? "owner" : "customer"}`,
            { waitUntil: "networkidle", timeout: 45000 },
          );
          const state = await page.evaluate(() => {
            const visible = (e) =>
              !!e.getClientRects().length &&
              getComputedStyle(e).visibility !== "hidden" &&
              !e.closest(".sr-only");
            const scrollable = (e) => {
              for (
                let p = e.parentElement;
                p && p !== document.body;
                p = p.parentElement
              )
                if (
                  /auto|scroll/.test(getComputedStyle(p).overflowX) &&
                  p.scrollWidth > p.clientWidth + 1
                )
                  return true;
              return false;
            };
            const clipped = [
              ...document.querySelectorAll(
                "main a,main button,main input,main select,main textarea,header a,header button",
              ),
            ]
              .filter(visible)
              .filter((e) => !scrollable(e))
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return r.right > innerWidth + 2 || r.left < -2;
              })
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                text: (e.getAttribute("aria-label") || e.textContent)
                  .trim()
                  .slice(0, 80),
                width: Math.round(e.getBoundingClientRect().width),
                right: Math.round(e.getBoundingClientRect().right),
              }));
            const nodes = [...document.querySelectorAll("main *,header *")]
              .filter(visible)
              .filter((e) => !scrollable(e) && !e.closest("svg"))
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
              .slice(0, 12)
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                text: e.textContent.trim().slice(0, 50),
                right: Math.round(e.getBoundingClientRect().right),
              }));
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              clipped,
              nodes,
              headings: [...document.querySelectorAll("h1,h2,h3")]
                .filter(visible)
                .map((e) => e.textContent.trim()),
            };
          });
          const row = {
            kind: group.kind,
            path,
            theme,
            width,
            ...state,
            errors,
          };
          findings.push(row);
          if (!baseline) {
            const menus = page.locator(".mobile-site-menu:visible");
            if (
              ["/", "/discover", "/professional", "/cart"].includes(path) &&
              (await menus.count())
            ) {
              const menu = menus.first();
              const summary = menu.locator("summary");
              await summary.click();
              await expect(menu).toHaveAttribute("open", "");
              const links = menu.locator("a");
              for (let i = 0; i < (await links.count()); i++) {
                const link = links.nth(i);
                expect(await link.getAttribute("href")).toMatch(/^\//);
                await link.scrollIntoViewIfNeeded();
                await link.click({ trial: true });
              }
              if (group.kind === "fixture")
                await menu
                  .getByRole("button", { name: "Sign out" })
                  .click({ trial: true });
              await page.keyboard.press("Escape");
              await expect(menu).not.toHaveAttribute("open", "");
              await expect(summary).toBeFocused();
              await summary.click();
              await page.mouse.click(1, 1);
              await expect(menu).not.toHaveAttribute("open", "");
            }
            if (group.kind === "fixture" && path === "/" && width < 1100) {
              for (const name of [
                "Upcoming Booking",
                "Messages",
                "Wallet & payments",
                "Meet the professionals",
              ])
                await expect(
                  page
                    .getByRole("heading", { name, exact: true })
                    .filter({ visible: true }),
                ).toBeVisible();
              await expect(
                page.locator(".mobile-home-professionals .professional-card"),
              ).toHaveCount(1);
            }
            if (group.kind === "public" && path === "/shop" && width < 861)
              await expect(
                page.locator(".marketplace-sidebar nav").nth(1),
              ).toBeVisible();
          }
          if (
            (baseline && (state.overflow > 1 || state.clipped.length)) ||
            (!baseline &&
              width === 390 &&
              [
                "/",
                "/professional",
                "/professional/availability",
                "/shop",
                "/admin",
              ].includes(path))
          )
            await page.screenshot({
              path: `reports/mobile-${baseline ? "before" : "after"}-${group.kind}-${path.replaceAll("/", "-") || "home"}-${theme}-${width}.png`,
              fullPage: true,
            });
          console.log(
            JSON.stringify({
              kind: group.kind,
              path,
              theme,
              width,
              overflow: state.overflow,
              clipped: state.clipped,
              nodes: state.overflow > 1 ? state.nodes : [],
              errors,
            }),
          );
          await page.close();
          await writeFile(
            `reports/mobile-${baseline ? "baseline" : "results"}.json`,
            JSON.stringify(findings, null, 2),
          );
        }
    }
  if (!baseline) {
    expect(
      findings.filter(
        (x) => x.overflow > 1 || x.clipped.length || x.errors.length,
      ),
    ).toEqual([]);
  }
} finally {
  if (browser) await browser.close();
  server.close();
  next.kill("SIGTERM");
  await new Promise((resolve) =>
    next.exitCode !== null ? resolve() : next.once("exit", resolve),
  );
  await log.close();
  await Promise.all(
    generatedFiles.map(({ path, content }) => writeFile(path, content)),
  );
}
