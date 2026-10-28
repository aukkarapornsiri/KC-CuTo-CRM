import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4183/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await openDesktopMenu(page,'Tickets / Service Desk','Service Overview');
 const root=page.locator('[data-service-desk]').first();await root.locator('.svc-overview-kpi').first().waitFor();
 assert.equal(await root.locator('.svc-overview-kpi').count(),4);
 await root.getByLabel('Period',{exact:true}).selectOption('month');await root.getByLabel('Period',{exact:true}).selectOption('all');
 const options=await root.getByLabel('Service team',{exact:true}).locator('option').count();if(options>1){await root.getByLabel('Service team',{exact:true}).selectOption({index:1});await root.getByLabel('Service team',{exact:true}).selectOption('');}
 await page.setViewportSize({width:1440,height:2300});await page.evaluate(()=>document.fonts.ready);await root.screenshot({path:'test-artifacts/service-redesign-en-1440.png'});
 await root.locator('.svc-overview-case').first().click();await root.getByRole('button',{name:'← รายการเคส / Cases',exact:true}).click();
 await openDesktopMenu(page,'Tickets / Service Desk','Service Overview');await root.locator('[data-kpi=unassigned]').click();await root.getByLabel('Search cases').waitFor();
 await openDesktopMenu(page,'Tickets / Service Desk','Service Overview');
 const dl=page.waitForEvent('download');await root.getByRole('button',{name:'Export CSV',exact:true}).click();assert.equal((await dl).suggestedFilename(),'service-tickets.csv');
 await page.getByRole('button',{name:'Switch to Thai',exact:true}).click();
 await root.getByRole('heading',{name:'ภาพรวมบริการ',exact:true}).waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:4200});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await root.screenshot({path:`test-artifacts/service-redesign-th-${width}.png`});}
 assert.deepEqual(errors,[]);console.log('PASS overview: real demo data, period/team filters, case detail, KPI drilldown, export, Thai/English, desktop/mobile');
}finally{await browser.close();}
