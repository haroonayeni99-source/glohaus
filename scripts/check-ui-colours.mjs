import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { server } from "./ui-audit.mjs";
const browser = await chromium.launch({ executablePath: process.env.GLOHAUS_TEST_BROWSER, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const findings = [];
try {
  for (const route of ["admin", "messages"]) for (const theme of ["light", "night"]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:3004/${route}?theme=${theme}&role=${route === "messages" ? "professional" : "owner"}`);
    await page.locator(route === "admin" ? ".admin-workspace" : ".message-centre").waitFor();
    findings.push({ route, theme, lowContrast: await page.evaluate(() => {
      const rgba = value => { const values = value.match(/[\d.]+/g)?.map(Number) ?? [0,0,0,0]; const rgb=values.slice(0,3).map(v => value.startsWith("color(srgb ") ? v*255 : v); return [...rgb, values[3] ?? 1]; };
      const blend = (fg, bg) => [0,1,2].map(i => fg[i] * fg[3] + bg[i] * (1-fg[3]));
      const luminance = rgb => rgb.map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i],0);
      const rows = [];
      for (const element of document.querySelectorAll('.admin-workspace *, .message-centre *')) {
        const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(" ");
        if (!text || !element.checkVisibility() || !element.getBoundingClientRect().width) continue;
        const style = getComputedStyle(element); const backgrounds = [];
        let gradient = false;
        for (let parent=element; parent; parent=parent.parentElement) { const parentStyle=getComputedStyle(parent); if (parentStyle.backgroundImage !== "none") gradient=true; backgrounds.unshift(rgba(parentStyle.backgroundColor)); }
        if (gradient) continue; // Solid backgrounds only; gradients need visual review.
        let bg = [255,255,255]; for (const layer of backgrounds) bg = blend(layer,bg);
        const fg = blend(rgba(style.color),bg); const [a,b] = [luminance(fg),luminance(bg)].sort((x,y)=>y-x);
        const ratio = (a+.05)/(b+.05); const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700;
        if (ratio < (large ? 3 : 4.5)) rows.push({ text: text.slice(0,90), class: element.className, ratio: Number(ratio.toFixed(2)), colour: style.color, bg });
      }
      return rows;
    }) });
    await page.close();
  }
  await writeFile("reports/ui-colour-results.json", JSON.stringify(findings,null,2));
  console.log(JSON.stringify(findings));
  if (findings.some(finding => finding.lowContrast.length)) process.exitCode = 1;
} finally { await browser.close(); server.close(); }
