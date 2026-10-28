import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
 await page.evaluate(async()=>{const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);r.leads=[{id:'lead-qa',code:'LD-QA',company_name:'บริษัท ทดสอบ จำกัด',contact_name:'คุณตัวอย่าง',product_interest:'Notebook 10 เครื่อง',note:'ต้องการใบเสนอราคาภายในวันที่ 30 ต.ค.',status:'new',phone:'0812345678',source:'LINE',created_at:'2026-10-28'}];r.native_sales_orders=[{id:'so-qa',code:'SO-QA-001',quotation_id:'quote-qa',quotation_code:'SQ-QA-001',status:'confirmed',customer_name:'บริษัท ตัวอย่าง จำกัด',currency:'THB',total:44940,items:[{name:'Notebook สำหรับทีมขาย',qty:1,part_number:'PN-001'}],po_number:'PO-001',expected_delivery_date:'2026-10-30',created_at:'2026-10-28',so_approval:{status:'pending',requested_at:'2026-10-28'}}];});
 await page.locator('.kc-header-approval').click();await page.locator('.kc-approval-card').waitFor();
 await page.locator('.kc-approval-app').screenshot({path:`test-artifacts/approval-inbox-${width}.png`});
 await page.locator('.kc-approval-card').click();const dialog=page.getByRole('dialog',{name:'เปิด SO',exact:true});await dialog.waitFor();
 await dialog.getByRole('button',{name:'ไม่อนุมัติ',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'กรุณาระบุเหตุผล'}).waitFor();
 const bounds=await dialog.evaluate(n=>({w:n.clientWidth,sw:n.scrollWidth,font:getComputedStyle(n).fontFamily}));assert.ok(bounds.sw<=bounds.w+1,JSON.stringify(bounds));assert.match(bounds.font,/IBM Plex Sans Thai/);
 await dialog.screenshot({path:`test-artifacts/approval-so-${width}.png`});
 await dialog.getByRole('button',{name:'ปิดฟอร์ม',exact:true}).click();
 await page.getByRole('dialog',{name:'ศูนย์อนุมัติ',exact:true}).getByRole('button',{name:'ปิดฟอร์ม',exact:true}).click();
 await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();await page.locator('.kc-header-approval').click();await page.getByRole('dialog',{name:'Approval center',exact:true}).waitFor();await page.getByRole('dialog',{name:'Approval center',exact:true}).getByRole('button',{name:'Close form',exact:true}).click();
 await page.setViewportSize({width:1440,height:844});await openDesktopMenu(page,'Leads');await page.getByRole('button',{name:'Details LD-QA',exact:true}).click();await page.setViewportSize({width,height:844});
 const lead=page.getByRole('dialog',{name:'Lead Detail',exact:true});await lead.waitFor();if(width===390){assert.ok(await lead.locator('.kc-lead-mobile-summary').isVisible());const assign=lead.getByRole('button',{name:'Assign lead',exact:true});const b=await assign.boundingBox();assert.ok(b.height>=52&&b.y+b.height<=845);assert.ok(await assign.isDisabled());await lead.getByRole('button',{name:'View all lead details',exact:true}).click();assert.ok(await lead.locator('.kc-lead-detail-body').isVisible());}await lead.screenshot({path:`test-artifacts/mobile-lead-${width}.png`});
 assert.deepEqual(errors,[]);await page.close();console.log('PASS Approval center',width);
}}finally{await browser.close();}
