// Isolated browser fixtures and intercepted requests only. No provider/live data.
import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
process.env.GLOHAUS_UI_AUDIT_ENTRY='tests/fixtures/commission-centre-entry.tsx';
const {server}=await import('./ui-audit.mjs');
const browser=await chromium.launch({...(process.env.GLOHAUS_TEST_BROWSER?{executablePath:process.env.GLOHAUS_TEST_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const theme of ['light','night'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});const calls=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{const body=route.request().postDataJSON();calls.push({url:route.request().url(),body});const rate=body.scenario==='zero'?0:body.scenario==='two'?200:800;await route.fulfill({json:route.request().url().endsWith('/simulate')?{rule:{basisPoints:rate,standardBasisPoints:800,ruleId:null,ruleReference:'hypothetical:'+body.scenario,pricingVersion:'simulation-only',expiresAt:null},commissionPence:rate/2,chargePence:2100,collectedPence:rate/2,professionalPendingPence:2000-rate/2,providerCostPence:52,platformNetPence:100+rate/2-52,waivedPence:400-rate/2,professionalAfterRefundPence:2000-rate/2,refundObligationPence:0,totalCommissionPence:rate/2,totalProviderCostPence:52,problems:[],estimated:true}:{saved:true}});});
  await page.goto(`http://127.0.0.1:3004/commission?theme=${theme}`);
  await expect(page.getByRole('button',{name:'Review rule',exact:true})).toBeDisabled();
  const mode=page.locator('section').filter({has:page.getByRole('heading',{name:'Test Mode — read-only',exact:true})}).last();
  await mode.getByLabel('Simulated booking pricing date').fill('2026-10-16T10:00');
  for(const [scenario,expected] of [['zero','0.00%'],['two','2.00%'],['standard','8.00%']]){await mode.getByLabel('Commission scenario').selectOption(scenario);await mode.getByRole('button',{name:'Run simulation'}).click();await expect(mode.getByRole('heading',{name:`Applied rate ${expected}`})).toBeVisible();}
  expect(calls.every(c=>c.url.endsWith('/simulate'))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`reports/commission-centre-${theme}-${width}.png`,fullPage:true});
  await page.goto(`http://127.0.0.1:3004/commission?theme=${theme}&active=1`);
  const schedule=page.locator('section').filter({has:page.getByRole('heading',{name:'Schedule a commission rule',exact:true})}).last();
  await schedule.getByLabel('Starts (your local time)',{exact:true}).fill('2026-10-16T10:00');await schedule.getByLabel('Ends (your local time)',{exact:true}).fill('2026-11-16T10:00');await schedule.getByLabel('Reason',{exact:true}).fill('Fictional commission offer for QA');await schedule.getByLabel('Commission percentage').fill('2');
  const prior=calls.length;await schedule.getByRole('button',{name:'Review rule',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(calls.length).toBe(prior);await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();expect(calls.length).toBe(prior);
  await schedule.getByRole('button',{name:'Review rule',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm financial change',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(calls.at(-1).body).toMatchObject({action:'create',basisPoints:200,scope:'all',confirmed:true});
  await page.goto(`http://127.0.0.1:3004/commission?theme=${theme}&professional=1`);
  await expect(page.getByRole('heading',{name:'Commission notices',exact:true})).toBeVisible();await page.getByLabel('How was your experience?').fill('I found the trial frustrating and difficult.');await page.getByLabel('What should we improve?').fill('Please make the booking process clearer.');await page.getByLabel('Would you use GLOHAUS again, and why?').fill('Not yet; the issues need fixing.');await page.getByRole('button',{name:'Submit feedback',exact:true}).click();await expect(page.getByText('Feedback received. GLOHAUS will check your trial participation; critical feedback is equally welcome.')).toBeVisible();expect(calls.at(-1).body.experience).toContain('frustrating');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`reports/commission-professional-${theme}-${width}.png`,fullPage:true});expect(errors).toEqual([]);results.push({theme,width,readOnlyScenarios:true,confirmation:true,cancelWithoutWrite:true,criticalFeedback:true,noOverflow:true});await page.close();
 }
 await writeFile('reports/commission-centre-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
