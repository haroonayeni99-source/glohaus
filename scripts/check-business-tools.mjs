// Actual components, fictional data and intercepted writes; no external account or payment calls.
import { chromium,devices,expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY="tests/fixtures/business-tools-entry.tsx";
const {server}=await import("./ui-audit.mjs");
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_CHROMIUM_PATH || undefined,args:["--no-sandbox","--disable-dev-shm-usage",...(process.env.GLOHAUS_CHROMIUM_ARGS || "").split(" ").filter(Boolean)]});
const results=[];
try {
 for(const [name,profile] of [["iphone-emulation",devices["iPhone 13"]],["android-emulation",devices["Pixel 7"]],["small-phone",{viewport:{width:320,height:760}}],["desktop",{viewport:{width:1440,height:1000}}]])for(const theme of ["light","night"]) {
   const page=await browser.newPage(profile),writes=[];let fail=false;
   await page.route("**/api/v1/**",route=>{const request=route.request();writes.push({url:request.url(),body:request.postDataJSON()});return route.fulfill({status:fail?503:200,contentType:"application/json",body:JSON.stringify(fail?{error:{code:"UNAVAILABLE"}}:{saved:true})});});
   const goto=async view=>{await page.goto(`http://127.0.0.1:3004/?theme=${theme}&view=${view}`);await page.addStyleTag({path:"src/components/business-tools.css"});};
   await goto("connections");
   await expect(page.getByRole("button",{name:"Provider setup required",exact:true}).first()).toBeDisabled();
   await expect(page.getByText("Permissions have expired or been removed.",{exact:false})).toBeVisible();
   await page.getByLabel("Appointment buffer",{exact:true}).selectOption("15");await page.getByRole("button",{name:"Save buffers",exact:true}).click();
   await expect(page.getByRole("status")).toContainText("Saved.");expect(writes.at(-1).body).toMatchObject({action:"preferences",bufferMinutes:15,travelBufferMinutes:0});
   const postForm=page.getByRole("heading",{name:"Add a post link",exact:true}).locator("..");
   await postForm.getByLabel("Post URL",{exact:true}).fill("https://www.instagram.com/reel/ABC123/");
   await postForm.getByRole("checkbox").check();await postForm.getByRole("button",{name:"Add post link",exact:true}).click();
   await expect(page.getByRole("status")).toContainText("Saved.");expect(writes.at(-1).body.consent).toBe(true);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
   await page.screenshot({path:`reports/business-tools-${name}-${theme}.png`,fullPage:true});
   await goto("review");await page.getByLabel("Public display name",{exact:false}).fill("Fictional client");await page.getByLabel("Your rating",{exact:true}).selectOption("1");
   await page.getByText("Quick feedback (optional)",{exact:true}).click();await page.getByLabel("Was your appointment on time?",{exact:true}).selectOption("very_late");
   await page.getByLabel("Private improvement suggestion",{exact:false}).fill("Private fixture suggestion");
   fail=true;await page.getByRole("button",{name:"Publish review",exact:true}).click();await expect(page.getByRole("status")).toContainText("could not be saved");
   expect(await page.getByLabel("Private improvement suggestion",{exact:false}).inputValue()).toBe("Private fixture suggestion");
   fail=false;await page.getByRole("button",{name:"Publish review",exact:true}).click();await expect(page.getByRole("status")).toContainText("published");
   expect(writes.at(-1).body).toMatchObject({rating:1,body:"",answers:{timing:"very_late"}});
   await goto("social");expect(await page.locator("iframe").count()).toBe(0);await page.route("https://www.tiktok.com/**",route=>route.fulfill({body:"<p>Mock provider frame</p>",contentType:"text/html"}));
   await page.getByRole("button",{name:"Load TikTok video",exact:true}).click();await expect(page.locator("iframe")).toHaveAttribute("src",/tiktok.com\/player\/v1\/12345678/);
   await expect(page.getByText("Manicure · from £45.00",{exact:false})).toBeVisible();
   await page.getByRole("button",{name:"Close embedded post",exact:true}).click();expect(await page.locator("iframe").count()).toBe(0);
   results.push({device:name,theme,passed:true,engine:"Chromium; mobile sizes are emulated"});await page.close();
 }
 await writeFile("reports/business-tools-browser.json",JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
