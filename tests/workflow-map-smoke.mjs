import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
for(const width of [1440,768,390]){
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4183/?demo=1');
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
 await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await openDesktopMenu(page,'Dashboard','Workflow Map');await page.setViewportSize({width,height:1000});
 const board=page.locator('.crm-workflow-board');await board.waitFor();
 assert.equal(await board.locator('.crm-workflow-card').count(),10);
 assert.deepEqual(await board.locator('.crm-workflow-step').allTextContents(),Array.from({length:10},(_,i)=>String(i+1).padStart(2,'0')));
 const so=board.locator('[data-flow-node=sales_orders]');await so.getByText('0',{exact:true}).waitFor();
 assert.equal(await so.getByRole('heading').innerText(),'Sales Orders (SO)');
 assert.ok(await board.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.waitForFunction(()=>document.querySelectorAll('.crm-workflow-connections g').length===9);
 const cards=await board.locator('[data-lane=sales] .crm-workflow-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 for(let i=1;i<cards.length;i++)assert.ok(width>900?cards[i].x>=cards[i-1].x+cards[i-1].width:cards[i].y>=cards[i-1].y+cards[i-1].height);
 await page.screenshot({path:`test-artifacts/workflow-so-${width}.png`,fullPage:true});
 await so.click();const dialog=page.getByRole('dialog',{name:'Sales Orders',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'Close form',exact:true}).click();
 await page.getByRole('button',{name:'Switch to Thai',exact:true}).click();await so.getByRole('heading',{name:'ใบสั่งขาย (SO)',exact:true}).waitFor();
 await so.click();await page.getByRole('dialog',{name:'ใบสั่งขาย (Sales Orders)',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await page.close();console.log(`PASS Workflow SO ${width}: count, order, connectors, responsive and TH/EN open SO`);
}finally{await browser.close();}
}
