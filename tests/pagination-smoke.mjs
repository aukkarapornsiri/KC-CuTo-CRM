import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/?demo=1');
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
 await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await page.evaluate(async()=>{
  const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
  const path=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
  const {DEMO_RECORDS:d}=await import(new URL(path,location.href).href);
  d.quotations=Array.from({length:125},(_,n)=>({id:'pagination-'+n,code:'PAGE-'+String(n).padStart(3,'0'),customer_name:'Pagination customer',project_name:'Pagination test',status:'sent',approval_status:'approved',total:100,currency:'THB'}));
 });
 if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation Follow-up');
 else{await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');const entry=nav.getByText('Quotation Follow-up',{exact:true});if(!await entry.isVisible())await nav.getByText('Quotations',{exact:true}).click();await entry.click();}
 const nav=page.getByRole('navigation',{name:'List pagination'});
 await nav.getByText('Page 1 of 3 · 125 records',{exact:true}).waitFor();
 assert(await nav.getByRole('button',{name:'Previous',exact:true}).isDisabled());
 await nav.getByRole('button',{name:'Go to page 3',exact:true}).click();
 await nav.getByText('Page 3 of 3 · 125 records',{exact:true}).waitFor();
 await page.getByText('PAGE-100',{exact:true}).waitFor();
 assert(await nav.getByRole('button',{name:'Next',exact:true}).isDisabled());
 assert.equal(await page.locator('.qf-center tbody tr').count(),25);
 const prev=await nav.getByRole('button',{name:'Previous',exact:true}).boundingBox(),next=await nav.getByRole('button',{name:'Next',exact:true}).boundingBox();
 assert.equal(prev.width,next.width);assert.equal(prev.height,44);assert.equal(next.height,44);
 const number=await nav.getByRole('button',{name:'Go to page 3',exact:true}).boundingBox();
 if(width>=1024)assert(Math.abs(prev.y+prev.height/2-number.y-number.height/2)<1);
 const box=await nav.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);
 await nav.getByRole('button',{name:'Go to page 2',exact:true}).click();
 await nav.getByText('Page 2 of 3 · 125 records',{exact:true}).waitFor();
 await page.getByRole('searchbox',{name:'Search quotations',exact:true}).fill('PAGE-001');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await nav.getByText('Page 1 of 1 · 1 records',{exact:true}).waitFor();
 await page.getByRole('searchbox',{name:'Search quotations',exact:true}).fill('no-results');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await nav.getByText('Page 0 of 0 · 0 records',{exact:true}).waitFor();
 assert(await nav.getByRole('button',{name:'Next',exact:true}).isDisabled());
 assert.deepEqual(errors,[]);
 await page.screenshot({path:`test-artifacts/pagination-${width}.png`,fullPage:true});
 console.log('PASS pagination '+width+': direct jump, rows, totals, filters, empty, boundaries, equal button sizes and alignment');await page.close();
}}finally{await browser.close();}
