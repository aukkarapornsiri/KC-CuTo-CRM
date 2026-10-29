import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 for(const width of [1440,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:width===320?568:900},hasTouch:width<700,isMobile:width<700});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');
  await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
  await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
  await page.evaluate(async()=>{
   const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
   const path=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
   const {DEMO_RECORDS:d}=await import(new URL(path,location.href).href);
   d.customers=[{id:'popup-qa',code:'POPUP-QA',name:'Customer 360 QA',status:'Active',email:'qa@example.test'}];
   d.contacts=[{id:'contact-qa',name:'QA Contact',customer_id:'popup-qa',email:'contact@example.test'}];
  });
  if(width>=1024)await openDesktopMenu(page,'Accounts','Account List');
  else{await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');await nav.getByText('Accounts',{exact:true}).click();await nav.getByText('Account List',{exact:true}).click();}
  const opener=page.getByRole('button',{name:'Details POPUP-QA',exact:true});
  const dialog=page.getByRole('dialog',{name:'Customer Intelligence / 360',exact:true});
  const root=dialog.getByRole('region',{name:'Customer 360',exact:true});
  assert.equal(await page.locator('.c360').count(),0);
  await opener.click();assert.equal(await dialog.count(),0);
  await opener.dblclick();await root.getByRole('heading',{name:'Customer 360 QA',exact:true}).waitFor();
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await page.locator('.c360').count(),1);
  assert.equal(await page.locator('[data-entity=customers] > .crm-record-detail').count(),0);
  const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.crm-customer360-dialog-body');return {fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:body.scrollWidth>body.clientWidth+1,scroll:body.scrollHeight>body.clientHeight,font:parseFloat(getComputedStyle(el.querySelector('.c360 p')).fontSize)};});
  assert.equal(geometry.fits,true);assert.equal(geometry.overflow,false);assert.equal(geometry.scroll,true);assert.ok(geometry.font>=14);
  for(const name of ['Related records','Timeline','Identity & duplicates','Next actions','Communications & finance','Data & AI preparation','Receivable references','Overview']){
   const button=root.getByRole('button',{name,exact:true});await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await dialog.isVisible(),true);
  }
  await root.getByRole('button',{name:'Related records',exact:true}).click();await root.locator('summary').filter({hasText:'Contacts (1)'}).click();await root.getByRole('button',{name:'QA Contact',exact:true}).waitFor();
  await root.getByRole('button',{name:'Data & AI preparation',exact:true}).click();await root.getByRole('button',{name:'Enter / edit information',exact:true}).click();
  const child=page.getByRole('form',{name:'Preparation form',exact:true});await child.waitFor();await page.keyboard.press('Escape');await child.waitFor({state:'hidden'});assert.equal(await dialog.isVisible(),true);
  await dialog.locator('.crm-customer360-dialog-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const close=dialog.getByRole('button',{name:'Close Customer 360',exact:true});const box=await close.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=page.viewportSize().height);
  await close.click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('.c360').count(),0);assert.equal(await opener.evaluate(el=>el===document.activeElement),true);
  await opener.press('Enter');await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  if(width<700){await opener.tap();await dialog.waitFor();await close.click();}
  await page.getByRole('button',{name:'Switch to Thai',exact:true}).click();
  await page.getByRole('button',{name:'รายละเอียด POPUP-QA',exact:true}).dblclick();await root.getByRole('button',{name:'ภาพรวม',exact:true}).waitFor();
  await page.screenshot({path:`test-artifacts/customer360-popup-${width}.png`});
  await dialog.getByRole('button',{name:'ปิดหน้าต่าง Customer 360',exact:true}).click();assert.equal(await page.locator('.c360').count(),0);
  assert.deepEqual(errors,[]);console.log(`PASS Customer 360 popup ${width}px: all eight tabs, nested form, dblclick/touch/keyboard, close/Escape/focus, internal scroll, no inline detail, TH/EN`);
  await page.close();
 }
}finally{await browser.close();}
