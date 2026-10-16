// Isolated interface regression. All mutations use explicitly fictional local
// records; this script cannot send email/push or access production accounts.
import {chromium,expect} from '@playwright/test';
import{writeFile}from'node:fs/promises';
process.env.GLOHAUS_UI_AUDIT_ENTRY='tests/fixtures/professional-notifications.tsx';
const{server}=await import('./ui-audit.mjs');
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const theme of ['light','night'])for(const width of [320,390,820,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
  await expect(page.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
  await expect(page.getByLabel('New bookings email',{exact:true})).toBeChecked();await expect(page.getByLabel('New bookings email',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Enable this device',exact:true})).toBeDisabled();await expect(page.getByText('Phone push is awaiting secure server configuration.')).toBeVisible();
  await page.getByLabel('Customer messages push',{exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Notification preferences saved.'})).toBeVisible();
  await page.getByLabel('Customer messages email',{exact:true}).click();await expect(page.getByLabel('Customer messages email',{exact:true})).not.toBeChecked();
  await page.reload();await expect(page.getByLabel('Customer messages push',{exact:true})).toBeChecked();await expect(page.getByLabel('Customer messages email',{exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Disable device',exact:true}).click();await expect(page.getByText('Disabled',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mark New customer message as read',exact:true}).click();await expect(page.locator('article[data-read="true"]')).toHaveCount(1);
  await expect(page.getByRole('link',{name:'Notifications',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
  await page.screenshot({path:`reports/professional-notifications-${theme}-${width}.png`,fullPage:true});results.push({theme,width,passed:true,checks:['essential email locked','separate preferences','saved after reload','device revoke','mark read','mobile bell','no overflow']});await context.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:3004/?fail=1');await page.getByLabel('Customer messages push',{exact:true}).click();await expect(page.getByRole('alert')).toContainText('Could not save');await expect(page.getByLabel('Customer messages push',{exact:true})).not.toBeChecked();results.push({name:'failed save retains preference',passed:true});
 await writeFile('reports/professional-notifications-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}catch(error){
 for(const [i,context] of browser.contexts().entries())for(const [j,page] of context.pages().entries())await page.screenshot({path:`reports/professional-notifications-failed-${i}-${j}.png`,fullPage:true}).catch(()=>{});
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
