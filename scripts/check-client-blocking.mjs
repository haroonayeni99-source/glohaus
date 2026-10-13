// Real components; fictional identities and isolated mutations only.
import { chromium,expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
process.env.GLOHAUS_UI_AUDIT_ENTRY="tests/fixtures/client-blocking-entry.tsx";
const {server}=await import("./ui-audit.mjs");
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_TEST_BROWSER,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const results=[];
const buffer=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=","base64");
try{
 for(const theme of ["light","night"])for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route(/\/api\/v1\/customer-photos\//,route=>route.fulfill({status:200,contentType:"image/png",body:buffer}));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  const go=path=>page.goto(`http://127.0.0.1:3004${path}${path.includes("?")?"&":"?"}theme=${theme}`);
  await go("/professional/clients");
  await page.getByRole("button",{name:"Block client",exact:true}).click();
  await expect(page.getByText(/Existing appointments and payments stay unchanged/)).toBeVisible();
  if ((theme==="light"&&width===320)||(theme==="night"&&width===1440)) { await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:`reports/client-block-confirm-${theme}-${width}.png`,fullPage:true}); }
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem("client-requests"))).toBeNull();
  await page.getByRole("button",{name:"Block client",exact:true}).click();
  await page.getByRole("button",{name:"Yes, block",exact:true}).click();
  await expect(page.getByText("New bookings blocked",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Unblock client",exact:true}).click();
  await page.evaluate(()=>sessionStorage.setItem("client-fail","1"));
  await page.getByRole("button",{name:"Yes, unblock",exact:true}).click();
  await expect(page.getByText("Could not save this change. Please try again.")).toBeVisible();
  await expect(page.getByText("New bookings blocked",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Yes, unblock",exact:true}).click();
  await expect(page.getByText("Can book with you",{exact:true})).toBeVisible();
  await page.getByLabel("Find a client").fill("missing");await page.getByRole("button",{name:"Search clients"}).click();
  await expect(page.getByText("No clients match this search.")).toBeVisible();
  await page.getByRole("link",{name:"Show all clients"}).click();await expect(page.getByRole("button",{name:"Block client",exact:true})).toBeVisible();
  await page.locator('select[name="view"]').selectOption("blocked");await page.getByRole("button",{name:"Search clients"}).click();await expect(page.getByRole("link",{name:"Show all clients"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await go("/account/profile");
  await page.getByLabel("First name",{exact:true}).fill("Alexandra");await page.getByLabel("Last name (optional)").fill("Longsurname");
  await page.getByRole("button",{name:"Save name"}).click();await expect(page.getByText("Your name has been saved.")).toBeVisible();
  await page.getByLabel("Last name (optional)").fill("");await page.getByRole("button",{name:"Save name"}).click();
  const file=page.locator('input[type="file"]');await file.setInputFiles({name:"portrait.png",mimeType:"image/png",buffer});
  await expect(page.getByText("Preview ready. Save your photo below.")).toBeVisible();await page.getByLabel("This is my photo and I have permission to use it.").check();
  await page.getByRole("button",{name:"Save photo",exact:true}).click();await expect(page.getByText("Your photo has been saved.")).toBeVisible();
  if ((theme==="light"&&width===320)||(theme==="night"&&width===1440)) { await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:`reports/customer-profile-${theme}-${width}.png`,fullPage:true}); }
  await page.getByRole("button",{name:"Remove photo",exact:true}).click();await expect(page.getByText("Photo removed.")).toBeVisible();
  await file.setInputFiles({name:"bad.txt",mimeType:"text/plain",buffer:Buffer.from("not an image")});await expect(page.getByText("Choose a JPEG, PNG or WebP image up to 20 MB.")).toBeVisible();await expect(page.getByRole("button",{name:"Save photo",exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await go("/sign-up");await expect(page.getByLabel("First name",{exact:true})).toBeVisible();await expect(page.getByLabel("Last name (optional)")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);results.push({theme,width,passed:true,errors});await page.close();
 }
 await writeFile("reports/client-blocking-results.json",JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
