import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
 await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await page.evaluate(async()=>{
  const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
  const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
  const {DEMO_RECORDS}=await import(new URL(uri,location.href).href);
  DEMO_RECORDS.leads=[{id:'qa-source-lead',code:'LD-QA-SOURCE',company_name:'QA Source Lead',contact_name:'Alex Test',first_name:'Alex',last_name:'Test',status:'new'}, {id:'qa-other-lead',code:'LD-QA-OTHER',company_name:'Different Lead',status:'new'}];
 });
 if(width>=1024)await openDesktopMenu(page,'Leads','Lead Inbox');
 else{
  await page.locator('button.lg\\:hidden').first().click();
  const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');
  if(!await nav.getByText('Lead Inbox',{exact:true}).isVisible())await nav.getByText('Leads',{exact:true}).click();
  await nav.getByText('Lead Inbox',{exact:true}).click();
 }
 await page.getByRole('button',{name:'Details LD-QA-SOURCE',exact:true}).click();
 await page.getByRole('dialog',{name:'Lead Detail',exact:true}).getByRole('button',{name:'Add Activity',exact:true}).click();
 const form=page.getByRole('form',{name:'Record form',exact:true});
 await form.getByLabel('Subject',{exact:true}).fill('ติดตามลีด QA Source Lead');
 await form.getByLabel('Scheduled at',{exact:true}).fill('2026-10-29T10:30');
 await form.getByLabel('Description',{exact:true}).fill('Review the received lead');
 await form.getByRole('button',{name:'Save',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Activity Details',exact:true});
 await dialog.waitFor();
 assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
 assert.match(await dialog.innerText(),/Follow up QA Source Lead/);
 assert.doesNotMatch(await dialog.innerText(),/ติดตาม/);
 const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
 assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
 await page.screenshot({path:`test-artifacts/activity-details-${width}.png`,fullPage:true});
 await dialog.getByRole('button',{name:'Close activity details',exact:true}).click();
 const root=page.locator('[data-entity=activities]');
 const details=root.getByRole('button',{name:/^Details /}).first();
 assert.match(await root.locator('tbody').innerText(),/Follow up QA Source Lead/);
 await details.click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await details.evaluate(el=>el===document.activeElement),true,'Closing restores focus');
 await details.click();await dialog.getByRole('button',{name:'Edit',exact:true}).click();
 await form.waitFor();await form.getByRole('button',{name:'Cancel',exact:true}).click();
 await details.click();await dialog.getByRole('button',{name:'Open Lead Details',exact:true}).click();
 const lead=page.getByRole('dialog',{name:'Lead Detail',exact:true});await lead.waitFor();
 assert.match(await lead.innerText(),/LD-QA-SOURCE/);assert.doesNotMatch(await lead.innerText(),/LD-QA-OTHER/);
 assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: modal, localization, close/Escape/focus, edit and exact source lead navigation`);
 await page.close();
}}finally{await browser.close();}
