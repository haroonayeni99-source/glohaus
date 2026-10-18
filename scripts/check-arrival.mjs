// Isolated real-component browser regression. All accounts and mutations are fictional.
import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
process.env.GLOHAUS_UI_AUDIT_ENTRY='tests/fixtures/arrival-entry.tsx';
const {server}=await import('./ui-audit.mjs');
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const theme of ['light','night'])for(const width of [320,390,820,1440])for(const role of ['customer','professional','owner']){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(_success,error)=>{setTimeout(()=>error({code:1,PERMISSION_DENIED:1}),20);return 1;},clearWatch:()=>{},getCurrentPosition:(_success,error)=>error({code:1})}});});
  await page.goto(`http://127.0.0.1:3004/?theme=${theme}&role=${role}`);
  if(role==='customer'){
   await expect(page.getByRole('heading',{name:'Travel and arrival',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm physical attendance'})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Enable Smart Arrival',exact:true})).toBeDisabled();
   await page.getByRole('button',{name:'I’ve reviewed the location and arrival instructions',exact:true}).click();
   await page.getByRole('button',{name:'Enable Smart Arrival',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Permission denied'})).toBeVisible();
   await page.getByRole('button',{name:'I’ve arrived',exact:true}).click();await expect(page.getByRole('button',{name:'I’ve arrived',exact:true})).toBeDisabled();
   await page.getByText('Plan my journey',{exact:true}).click();await page.getByLabel('Starting address',{exact:true}).fill('Private home address');await page.getByLabel('Transport',{exact:true}).selectOption('transit');
   const link=page.getByRole('link',{name:'Check route and current travel estimate in Google Maps'});expect(new URL(await link.getAttribute('href')).searchParams.get('origin')).toBe('Private home address');
   await page.getByRole('button',{name:'Save journey plan',exact:true}).click();await expect(page.getByText(/Recommended departure:/)).toBeVisible();
   const requests=await page.evaluate(()=>window.arrivalRequests);expect(requests.some(r=>JSON.stringify(r).includes('Private home address'))).toBe(false);expect(requests.some(r=>r.action==='reading')).toBe(false);
  }else if(role==='professional'){
   await expect(page.getByRole('heading',{name:'Manage arrivals',exact:true})).toBeVisible();await expect(page.getByText('Plan my journey',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Enable Smart Arrival',exact:true})).toHaveCount(0);
   await page.getByRole('button',{name:'Confirm physical attendance',exact:true}).click();await page.getByRole('button',{name:'Record appointment started',exact:true}).click();await expect(page.getByRole('button',{name:'Record appointment started',exact:true})).toBeDisabled();
  }else{await expect(page.getByText(/Explicit acknowledgement is recorded separately/)).toBeVisible();await expect(page.getByText('Email: sent · Attempts: 1',{exact:false})).toBeVisible();await expect(page.getByText('Accepted by push service (device display unconfirmed)',{exact:false})).toBeVisible();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
  await page.screenshot({path:`reports/arrival-${role}-${theme}-${width}.png`,fullPage:true});results.push({role,theme,width,passed:true});await context.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:3004/?fail=1');await page.getByRole('button',{name:'I’ve reviewed the location and arrival instructions',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Reload and review'})).toBeVisible();await expect(page.getByRole('button',{name:'Enable Smart Arrival',exact:true})).toBeDisabled();results.push({name:'failed acknowledgement cannot enable tracking',passed:true});
 await writeFile('reports/arrival-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
