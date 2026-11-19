// Actual UI, fictional local data and mocked API; no account, provider or storage writes.
import {chromium,expect} from '@playwright/test';
process.env.GLOHAUS_UI_AUDIT_ENTRY='tests/fixtures/portfolio-organisation-entry.tsx';
const {server}=await import('./ui-audit.mjs');
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
try{
 for(const width of [320,390,768,1440])for(const theme of ['light','night']){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const data={collections:[],memberships:[],presentation:[]},writes=[];let fail=false;
  const id='11111111-1111-4111-8111-111111111111';
  await page.route('**/api/v1/professional/portfolio/organisation',route=>{
   if(route.request().method()==='POST'){
    const input=route.request().postDataJSON();writes.push(input);
    if(fail)return route.fulfill({status:503,json:{}});
    if(input.action==='saveCollection')data.collections=[{id,name:input.name,publication_status:input.publicationStatus,sort_order:input.sortOrder}];
    if(input.action==='saveUpload'){data.presentation=[{asset_id:input.id,featured:input.featured,sort_order:input.sortOrder}];data.memberships=input.collectionIds.map(collection_id=>({collection_id,asset_id:input.id,social_post_id:null}));}
    if(input.action==='deleteCollection'){data.collections=[];data.memberships=[];}
    return route.fulfill({json:{saved:true}});
   }
   return route.fulfill({json:data});
  });
  await page.goto(`http://127.0.0.1:3004/?theme=${theme}`);
  const create=page.getByRole('group',{name:'Create a collection',exact:true});
  await create.getByLabel('Collection name',{exact:true}).fill('Signature braids');
  fail=true;await create.getByRole('button',{name:'Create collection',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('could not be saved');await expect(create.getByLabel('Collection name',{exact:true})).toHaveValue('Signature braids');
  fail=false;await create.getByRole('button',{name:'Create collection',exact:true}).click();
  const edit=page.getByRole('group',{name:'Edit Signature braids',exact:true});await expect(edit).toBeVisible();
  await edit.getByLabel('Collection visibility').selectOption('published');await edit.getByLabel('Collection order (lower first)').fill('3');await edit.getByRole('button',{name:'Save collection',exact:true}).click();await expect(page.getByRole('status')).toContainText('organisation saved');
  const upload=page.getByRole('group',{name:'Fictional uploaded braids',exact:true});await upload.getByLabel('Pin as featured work').check();await upload.getByLabel('Display order (lower first)').fill('2');await upload.getByRole('checkbox',{name:'Signature braids · published',exact:true}).check();await upload.getByRole('button',{name:'Save uploaded work',exact:true}).click();await expect(page.getByRole('status')).toContainText('organisation saved');
  expect(writes.at(-1)).toMatchObject({action:'saveUpload',featured:true,sortOrder:2,collectionIds:[id]});await expect(upload).toContainText('Uploaded file · draft');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const input of await page.locator('input:not([type=checkbox]),select,button').all())expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(44);
  page.once('dialog',dialog=>dialog.accept());await edit.getByRole('button',{name:'Delete collection',exact:true}).click();await expect(edit).toHaveCount(0);await expect(page.getByRole('group',{name:'Fictional uploaded braids',exact:true})).toBeVisible();
  await page.screenshot({path:`reports/portfolio-organisation-${width}-${theme}.png`,fullPage:true});await page.close();
 }
 console.log('Portfolio collection create/edit/delete, failure retry, pin/order/assignment and responsive controls passed in 8 theme/viewport combinations.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
