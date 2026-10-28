import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{for(const width of [1710,390]){
 const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 // Navigate with desktop menus, then verify each page at the requested width.
 const cases=[['Leads','Lead Inbox'],['Contacts','Contact List'],['Accounts','Account List'],['Opportunities',null],['Quotations',null],['Contracts & Renewal',null],['Activities',null],['Documents',null]];
 for(const [parent,child]of cases){
  await page.setViewportSize({width:1710,height:1100});await openDesktopMenu(page,parent,child);await page.locator('.crm-menu-controls').waitFor();await page.setViewportSize({width,height:1100});
  const root=page.locator('.crm-menu-controls');
  const toggle=root.getByRole('button',{name:'Toggle filters',exact:true});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  const boxes=await root.locator('select,input,button').evaluateAll(ns=>ns.filter(n=>n.offsetParent).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
  assert.ok(boxes.every(b=>b.h===40),parent+' control heights '+JSON.stringify(boxes));
  assert.ok(boxes.every(b=>b.x>=0&&b.x+b.w<=width+1),parent+' viewport '+JSON.stringify(boxes));
  if(width===1710){const search=await root.locator('input[type=search]').boundingBox(),filter=await root.locator('select').first().boundingBox();assert.ok(Math.abs(search.y-filter.y)<=3,parent+' aligns search and filters');}
  await root.locator('input[type=search]').fill('layout-check-no-match');await root.locator('input[type=search]').fill('');
  await toggle.click();assert.equal(await root.locator('.crm-menu-filter-fields').count(),0);await toggle.click();
  await root.screenshot({path:`test-artifacts/menu-${parent.replaceAll(' ','-')}-${width}.png`});console.log('PASS',parent,width);
 }
 assert.deepEqual(errors,[]);await page.close();
}}finally{await browser.close();}
