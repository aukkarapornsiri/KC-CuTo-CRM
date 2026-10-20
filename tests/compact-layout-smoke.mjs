import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
const links=fs.readFileSync('index.html','utf8').match(/<link[^>]+stylesheet[^>]*>/g).join('\n');
const cols=['name','customer_name','stage','amount','probability','close_date','owner_name','status','actions'];
const rows=[['Asus Expertbook P5405CSA-NZ0089X','CUBE OF NINE CO.,LTD.','ลูกค้าเป้าหมาย','44,000','0','2026-10-31','Natenarin Khowsuwan','เปิด','รายละเอียด'],['KC Tablet Rugged Industrial','TOOLING SERVICE CENTER CO., LTD.','เสนอราคา','1','90','2026-11-15','Onjira Suwannasart','เปิด','รายละเอียด']];
for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:800}});
await page.setContent('<base href="'+(process.env.SITE_URL||'http://127.0.0.1:4173/')+'">'+links+'<div class="kc-app"><section class="crm-settings crm-internal" data-entity="opportunities"><div class="crm-table-scroll"><table class="crm-master-table"><thead><tr>'+cols.map(c=>'<th data-field="'+c+'">'+c+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((v,i)=>'<td data-field="'+cols[i]+'">'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section></div>');
await page.evaluate(()=>document.fonts.ready);
const result=await page.evaluate(()=>{const cell=document.querySelector('[data-field=amount]');const table=document.querySelector('table');return {padding:[...table.querySelectorAll('th,td')].map(c=>getComputedStyle(c).paddingLeft),size:getComputedStyle(cell).fontSize,wrap:getComputedStyle(cell).whiteSpace,align:getComputedStyle(cell).textAlign,scroll:getComputedStyle(table.parentElement).overflowX,positions:[...document.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>Math.round(c.getBoundingClientRect().x)))}});
assert.equal(new Set(result.padding).size,1);assert.equal(result.size,'13px');assert.equal(result.wrap,'nowrap');assert.equal(result.align,'right');assert.equal(result.scroll,'auto');assert.deepEqual(result.positions[0],result.positions[1]);
await page.screenshot({path:'test-artifacts/crm-compact-'+width+'.png',fullPage:true});console.log('PASS compact table '+width+'px',result.size);await page.close();
} }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
