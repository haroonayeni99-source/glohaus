// Real voting components; fictional accounts and locally mocked mutations only.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { server } from "./ui-audit.mjs";
const browser=await chromium.launch({executablePath:process.env.GLOHAUS_TEST_BROWSER,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const results=[];
try {
  for(const role of ["customer","professional"]) for(const theme of ["light","night"]) for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(`http://127.0.0.1:3004/feature-votes?role=${role}&theme=${theme}`);
    const idea=page.getByRole('article',{name:'Clearer booking',exact:true});
    await expect(idea.getByRole('button',{name:'Like · 3',exact:true})).toBeEnabled();
    await idea.getByRole('button',{name:'Dislike · 1',exact:true}).click();
    await expect(idea).toContainText('5 total votes · 60% liked');await expect(idea.getByRole('button',{name:'Dislike · 2',exact:true})).toHaveAttribute('aria-pressed','true');
    const contrast=await idea.getByRole('button',{name:'Dislike · 2',exact:true}).evaluate(element=>{
      const style=getComputedStyle(element);const lum=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const [l,d]=[lum(style.color),lum(style.backgroundColor)].sort((a,b)=>b-a);return(l+.05)/(d+.05);
    });expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({path:`reports/votes-${role}-${theme}-${width}.png`});
    await idea.getByRole('button',{name:'Like · 3',exact:true}).click();await expect(idea).toContainText('Like · 4');await expect(idea).toContainText('Dislike · 1');await expect(idea).toContainText('5 total votes · 80% liked');
    await idea.getByRole('button',{name:'Like · 4',exact:true}).click();await expect(idea).toContainText('4 total votes');await expect(idea.getByText('Your choice:',{exact:false})).toHaveCount(0);
    const closed=page.getByRole('article',{name:'A previous idea',exact:true});await expect(closed).toContainText('Voting closed');await expect(closed).toContainText('5 total votes');await expect(closed.getByRole('button',{name:'Dislike · 3',exact:true})).toBeDisabled();
    const requests=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('audit-requests')||'[]'));expect(requests).toHaveLength(3);expect(requests.map(request=>JSON.parse(request.body).choice)).toEqual(['dislike','like','none']);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);expect(overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);results.push({role,theme,width,requests:requests.length,contrast,overflow,errors});await page.close();
  }
  for(const theme of ['light','night']) for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(`http://127.0.0.1:3004/admin?theme=${theme}#marketing`);
    const panel=page.locator('.owner-marketing-panel');await expect(panel.getByLabel('Voting duration (days)')).toHaveValue('7');
    await panel.getByLabel('Feature or idea').fill('Simpler appointment booking');await panel.getByLabel('Short explanation').fill('Make appointment booking easier for everyone.');await panel.getByLabel('Voting duration (days)').fill('14');
    await panel.getByRole('button',{name:'Publish private vote',exact:true}).click();await expect(panel.getByRole('status')).toContainText('published for 14 day(s)');
    const row=panel.locator('.owner-feature-result').first();await expect(row).toContainText('Like 3');await expect(row).toContainText('Dislike 1');await expect(row).toContainText('Total 4');
    await row.scrollIntoViewIfNeeded();await page.screenshot({path:`reports/vote-owner-results-${theme}-${width}.png`});
    await panel.getByRole('button',{name:'Refresh vote results',exact:true}).click();
    const requests=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('audit-requests')||'[]'));expect(requests).toHaveLength(1);expect(JSON.parse(requests[0].body)).toMatchObject({type:'feature',durationDays:14});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);expect(overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);results.push({role:'owner',theme,width,requests:requests.length,overflow,errors});await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:1000}});await page.goto('http://127.0.0.1:3004/feature-votes?response=expired');const idea=page.getByRole('article',{name:'Clearer booking',exact:true});await idea.getByRole('button',{name:'Like · 3',exact:true}).click();await expect(idea).toContainText('Voting closed');await expect(idea.getByRole('button',{name:'Dislike · 1',exact:true})).toBeDisabled();await expect(page.getByRole('status')).toContainText('This vote has ended');await page.close();
  await writeFile('reports/feature-votes-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();server.close();}
