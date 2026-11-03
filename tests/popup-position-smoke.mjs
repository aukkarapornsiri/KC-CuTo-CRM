import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('test-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
try{for(const [width,height]of [[1440,900],[390,844],[320,568]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*.supabase.co/**',route=>route.abort());await page.goto('http://127.0.0.1:4178/');await page.locator('.kc-login-shell').waitFor();
 await page.evaluate(async()=>{const {openMicrosoftSettings}=await import('/src/microsoft-integration-settings.mjs');openMicrosoftSettings({client:{functions:{invoke:async()=>({data:{ok:true,connected:false,error:'Microsoft token request failed (401)'}})}},provider:'microsoft_calendar'});});
 const dialog=page.locator('[data-microsoft-settings]');
 const centered=async locator=>{const r=await locator.boundingBox();assert.ok(r);assert.ok(Math.abs(r.x+r.width/2-width/2)<2,JSON.stringify(r));assert.ok(Math.abs(r.y+r.height/2-height/2)<2,JSON.stringify(r));assert.ok(r.x>=-1&&r.y>=-1);assert.ok(r.x+r.width<=width+1&&r.y+r.height<=height+1);};
 await centered(dialog);await page.screenshot({path:`test-artifacts/microsoft-centered-${width}.png`});
 await dialog.getByRole('button',{name:'บันทึกและทดสอบ',exact:true}).click();await dialog.getByRole('status').filter({hasText:'401'}).waitFor();await centered(dialog);await dialog.getByRole('button',{name:'ปิด',exact:true}).last().click();assert.equal(await dialog.count(),0);
 // Actual application dialog classes with overflowing content use the same rule.
 for(const className of ['crm-profile-dialog','crm-inventory-dialog','svc-dialog','kc-chat-dialog','crm-quotation-detail-dialog','']){
  await page.evaluate(className=>{const d=document.createElement('dialog');d.className=className;d.dataset.positionQa='';d.style.width='min(520px,calc(100vw - 32px))';d.style.maxHeight='calc(100dvh - 32px)';d.style.overflow='auto';d.innerHTML='<div style="height:1200px">Long content</div><button>Bottom action</button>';document.body.append(d);d.showModal();},className);
  const d=page.locator('[data-position-qa]');await centered(d);await d.getByRole('button',{name:'Bottom action'}).scrollIntoViewIfNeeded();assert.equal(await d.getByRole('button',{name:'Bottom action'}).isVisible(),true);await page.evaluate(()=>{const d=document.querySelector('[data-position-qa]');d.close();});assert.equal(await d.isVisible(),false);await page.evaluate(()=>document.querySelector('[data-position-qa]').remove());
 }
 await page.evaluate(()=>{const overlay=document.createElement('div');overlay.className='kc-lead-detail-overlay';overlay.dataset.overlayQa='';overlay.innerHTML='<section role="dialog" class="kc-lead-detail-modal" style="height:180px">Lead details</section>';document.body.append(overlay);});
 await centered(page.locator('[data-overlay-qa]>section'));assert.deepEqual(errors,[]);console.log(`PASS ${width}×${height}: Microsoft, native dialogs, overflow, close, lead centering`);await page.close();
}}finally{await browser.close();}
