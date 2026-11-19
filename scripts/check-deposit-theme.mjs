import { chromium, expect } from "@playwright/test";
process.env.GLOHAUS_UI_AUDIT_ENTRY = "tests/fixtures/deposit-theme-entry.tsx";
const { server } = await import("./ui-audit.mjs");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER || undefined, args: ["--no-sandbox"] });
const results = [];
try {
  for (const theme of ["light", "night"]) for (const width of [320, 390, 820, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const starter = page.getByRole("region", {name:"Starter service"});
    const verified = page.getByRole("region", {name:"Verified service"});
    await expect(starter.getByText("Starter professionals cannot set a deposit.", {exact:false})).toBeVisible();
    await expect(starter.locator("input,select")).toHaveCount(0);
    const selectors = [".deposit-selector legend", ".deposit-selector-intro", ".deposit-selector-intro strong", ".deposit-mode-options label", ".deposit-field", ".deposit-field select", ".deposit-selected"];
    for (const selector of selectors) {
      for (const element of await page.locator(selector).all()) {
        await expect(element).toBeVisible();
        const ratio = await element.evaluate(el => {
          const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
          const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          let ancestor = el;
          while (ancestor && getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)") ancestor = ancestor.parentElement;
          const foreground = luminance(getComputedStyle(el).color);
          const background = luminance(getComputedStyle(ancestor).backgroundColor);
          return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        });
        expect(ratio, `${theme} ${width} ${selector}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(verified.getByRole("status",{name:"Selected deposit"})).toHaveText("1000");
    await verified.getByRole("combobox",{name:"Percentage",exact:true}).selectOption("40");
    await expect(verified.getByRole("status",{name:"Selected deposit"})).toHaveText("2000");
    await verified.getByRole("radio",{name:"Fixed deposit",exact:true}).check();
    await verified.getByRole("spinbutton",{name:"Fixed deposit (£)",exact:true}).fill("7.50");
    await expect(verified.getByRole("status",{name:"Selected deposit"})).toHaveText("750");
    await expect(verified.getByRole("spinbutton")).toHaveAttribute("min","7.50");
    await expect(verified.getByRole("spinbutton")).toHaveAttribute("max","20.00");
    const ratio = await verified.getByRole("spinbutton").evaluate(el => {
      const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const style=getComputedStyle(el),a=lum(style.color),b=lum(style.backgroundColor); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/deposit-${theme}-${width}.png`, fullPage: true });
    results.push({theme, width, contrast: "AA", overflow: false});
    await page.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
