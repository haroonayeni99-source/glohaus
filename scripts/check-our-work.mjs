import { chromium, expect } from "@playwright/test";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/our-work-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
try {
  for (const theme of ["light", "night"]) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: {width,height:844} });
    const errors = [], outside = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => { outside.push(route.request().url()); return route.abort(); });
    await page.route("**/api/media/**", route => route.fulfill({status:404,body:"fixture media unavailable"}));
    await page.route("**/api/v1/social-thumbnails/**", route => route.fulfill({status:404,body:"fixture preview unavailable"}));
    await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
    const tiles = page.locator(".our-work-tile"), viewer = page.getByRole("dialog");
    await expect(tiles).toHaveCount(3);
    await expect(tiles.first()).toContainText("Pinned");
    await expect(page.getByText("PRIVATE DRAFT")).toHaveCount(0);
    const geometry = await tiles.first().evaluate(el => ({width:el.offsetWidth,height:el.offsetHeight,columns:getComputedStyle(el.parentElement).gridTemplateColumns.split(" ").length}));
    expect(geometry.columns).toBe(3);
    expect(Math.abs(geometry.width / geometry.height - 9 / 16)).toBeLessThan(.015);
    expect(await page.locator(".our-work-grid video[autoplay]").count()).toBe(0);
    await page.getByRole("button",{name:"Hair",exact:true}).click();
    await expect(tiles).toHaveCount(2);
    await tiles.first().click();
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("link",{name:"Book this look"})).toHaveCount(0);
    await expect(viewer.locator("video")).toHaveCount(0);
    await viewer.getByRole("button",{name:"Next work",exact:true}).click();
    await expect(viewer.locator("video")).toHaveCount(1);
    expect(await viewer.locator("video").evaluate(el=>el.muted)).toBe(true);
    await viewer.getByRole("button",{name:"Turn sound on"}).click();
    expect(await viewer.locator("video").evaluate(el=>el.muted)).toBe(false);
    await page.keyboard.press("Escape");
    await expect(viewer).not.toBeVisible();
    await expect(tiles.first()).toBeFocused();
    await tiles.first().click();
    await page.goBack();
    await expect(viewer).not.toBeVisible();
    await page.getByRole("button",{name:"Makeup",exact:true}).click();
    await expect(tiles).toHaveCount(1);
    await tiles.first().click();
    await expect(viewer.getByRole("link",{name:"Book this look",exact:true})).toHaveAttribute("href","/p/fictional/services/makeup-service");
    // No third-party embeds or cookies before the viewer's explicit Load action.
    expect(outside).toEqual([]);
    await viewer.getByRole("button",{name:"Close work viewer"}).click();
    await expect(viewer).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
    expect(errors).toEqual([]);
    await page.screenshot({path:`reports/our-work-${theme}-${width}.png`,fullPage:true});
    console.log(JSON.stringify({theme,width,grid:true,collections:true,privateDraftExcluded:true,viewer:true,history:true,sound:true,linkedBooking:true}));
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
