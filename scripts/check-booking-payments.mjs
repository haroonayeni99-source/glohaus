import {chromium,expect} from "@playwright/test";
process.env.GLOHAUS_UI_AUDIT_ENTRY="tests/fixtures/booking-payments-entry.tsx";
const {server}=await import("./ui-audit.mjs");
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_TEST_BROWSER||undefined,headless:true,args:["--no-sandbox"]});
try{
 for(const theme of ["light","night"])for(const width of [375,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const mode of ["choice","required","starter"]){
   await page.goto(`http://127.0.0.1:3004/?theme=${theme}&mode=${mode}`);await page.getByRole("button",{name:"Continue",exact:true}).click();
   if(mode==="choice"){
    await expect(page.getByRole("radio")).toHaveCount(2);
    await page.getByRole("radio",{name:/Pay in full online/}).check();
    await expect(page.locator(".booking-pay-button")).toHaveText("Continue to pay £51.00");
    await expect(page.locator(".payment-summary-balance")).toContainText("£0.00");
    const contrasts=await page.evaluate(()=>{
      const rgb=s=>s.match(/[\d.]+/g)?.slice(0,3).map(Number)??[255,255,255];
      const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      return [".booking-policy dd",".booking-service-reference small",".booking-payment-choice label"].map(selector=>{
        const el=document.querySelector(selector);let parent=el;let bg="rgba(0, 0, 0, 0)";
        while(parent&&(bg==="transparent"||bg==="rgba(0, 0, 0, 0)")){bg=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
        const a=luminance(rgb(getComputedStyle(el).color));const b=luminance(rgb(bg));return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });
    });
    for(const result of contrasts)expect(result.ratio,`${theme} ${result.selector} contrast`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({path:`reports/booking-payment-full-${theme}-${width}.png`,fullPage:true});
    await page.getByRole("radio",{name:/Pay deposit online/}).check();
    await expect(page.locator(".booking-pay-button")).toHaveText("Continue to pay £16.00");
    await expect(page.locator(".payment-summary-balance")).toContainText("£35.00");
    await page.getByRole("radio",{name:/Pay in full online/}).check();
   }else{
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.locator(".booking-pay-button")).toHaveText("Continue to pay £51.00");
   }
   await page.getByRole("checkbox").check();await page.locator(".booking-pay-button").click();
   await expect(page.getByRole("status").filter({hasText:"Fixture: chosen payment recorded"})).toBeVisible();
   const body=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("payment-requests")).findLast(r=>r.url==="/api/v1/bookings").body);
   expect(body.paymentChoice).toBe(mode==="choice"?"full":"auto");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto(`http://127.0.0.1:3004/?theme=${theme}&mode=editor`);
  await page.getByLabel(/^Booking payment/).selectOption("full");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Draft saved"})).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("payment-requests")).findLast(r=>r.url==="/api/v1/professional/policies").body);
  expect(saved.policy.paymentRequirement).toBe("full");
  await page.screenshot({path:`reports/booking-payment-editor-${theme}-${width}.png`,fullPage:true});await page.close();
 }
 console.log("Booking payment choices, required full payment, starter behaviour and policy settings pass in both themes at mobile/desktop widths.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
