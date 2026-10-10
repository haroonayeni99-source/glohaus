// Run with GLOHAUS_TEST_BROWSER pointing to a locally installed Chromium.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { server } from "./ui-audit.mjs";
if (!process.env.GLOHAUS_TEST_BROWSER) throw new Error("Set GLOHAUS_TEST_BROWSER to Chromium's executable path");
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const findings = [];
try {
  for (const role of ["owner", "admin"]) for (const theme of ["light", "night"]) for (const width of [1440, 1024, 820, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:3004/admin?role=${role}&theme=${theme}`);
    await page.locator(".admin-workspace").waitFor();
    const state = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.admin-workspace a[href^="#"]')];
      const dead = links.filter(a => !document.getElementById(a.getAttribute("href").slice(1))).map(a => a.textContent);
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
      return { dead, duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    findings.push({ role, theme, width, ...state, errors });
    async function checkUncovered(id) {
      const covered = await page.evaluate(({id,width}) => {
        const target=document.getElementById(id);
        const header=document.querySelector(width > 880 ? ".owner-topbar" : ".admin-navigation");
        return target.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 2;
      }, {id,width});
      if (covered) findings.push({role,theme,width,coveredTarget:id});
    }
    if (width === 1440 || width === 390) await page.screenshot({ path: `reports/${role}-${theme}-${width}.png` });
    if (width > 880) {
      await page.getByRole("button", { name: "Minimise administration menu" }).click();
      await page.screenshot({ path: `reports/${role}-${theme}-${width}-compact.png` });
      await page.getByRole("button", { name: "Expand administration menu" }).click();
      const links = await page.locator('.admin-navigation nav a').all();
      for (const link of links) {
        const href = await link.getAttribute("href"); await link.click();
        await page.waitForTimeout(30);
        const selected = await page.locator('.admin-navigation nav [aria-current="location"]').getAttribute("href");
        if (selected !== href) findings.push({ role, theme, width, navigationMismatch: { clicked: href, selected } });
        await checkUncovered(href.slice(1));
      }
    } else {
      const picker = page.getByLabel("Go to section");
      for (const option of await picker.locator('option').all()) {
        const id = await option.getAttribute('value'); await picker.selectOption(id);
        await page.waitForTimeout(30);
        if (!await page.locator(`#${id}`).isVisible()) findings.push({ role, theme, width, pickerMissing: id });
        await checkUncovered(id);
      }
    }
    await page.close();
  }
  for (const role of ["customer", "professional"]) for (const theme of ["light", "night"]) for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    await page.goto(`http://127.0.0.1:3004/messages?role=${role}&theme=${theme}`);
    await page.locator('.message-bubble').first().waitFor();
    findings.push({ role, theme, width, bubbles: await page.locator('.message-bubble').count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
    await page.screenshot({ path: `reports/messages-${role}-${theme}-${width}.png` });
    await page.close();
  }
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3004/admin?fail=all');
  await page.locator('.admin-workspace').waitFor();
  findings.push({ failuresVisible: await page.getByRole('button',{name:'Retry loading'}).count(), missingFailureTargets: await page.evaluate(() => [...document.querySelectorAll('.admin-navigation nav a')].filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash)) });
  await page.close();
  await writeFile('reports/ui-audit-results.json', JSON.stringify(findings,null,2));
  console.log(JSON.stringify(findings));
  if (findings.some(f => f.dead?.length || f.duplicateIds?.length || f.errors?.length || f.overflow > 1 || f.navigationMismatch || f.pickerMissing || f.coveredTarget || f.missingFailureTargets?.length)) process.exitCode = 1;
} finally { await browser.close(); server.close(); }
