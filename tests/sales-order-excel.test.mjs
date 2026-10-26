import test from 'node:test';
import assert from 'node:assert/strict';
import {salesOrderSheets,salesOrderXlsx} from '../src/sales-order-excel.mjs';
const order={code:'SO-001',customer_name:'ลูกค้า & <ทดสอบ>',tax_id:'0012345678901',status:'confirmed',po_date:'2026-10-26',total:107,net_total:104,withholding_tax:3,delivery_details:{recipient_phone:'0810000000'},items:[{name:'=HYPERLINK("https://example.com")',qty:1.5,price:100,discount:0,total:150,cost:98765,part_number:'0001'}],cost_sheet:{cost_total:98765}};
test('export preserves identifiers, numbers and dates without confidential cost fields',()=>{
 const [summary,items]=salesOrderSheets(order,{status:'pending'},'en');
 assert.equal(summary.rows.find(r=>r[0]==='Tax ID')[1],'0012345678901');
 assert.equal(summary.rows.find(r=>r[0]==='Recipient phone')[1],'0810000000');
 assert.equal(summary.rows.find(r=>r[0]==='Net total')[1],104);
 assert.equal(summary.rows.find(r=>r[0]==='Approval')[1],'Pending');
 assert.equal(typeof summary.rows.find(r=>r[0]==='PO date')[1].date,'number');
 assert.equal(items.rows[1][4],1.5);assert.equal(items.rows[1][2],'0001');
 assert.ok(!JSON.stringify([summary,items]).includes('98765'));
});
test('XLSX uses safe inline strings with no formulas, external links or private fields',()=>{
 const bytes=salesOrderXlsx(order,{status:'approved'},'th'),text=new TextDecoder().decode(bytes);
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.ok(text.includes('ลูกค้า &amp; &lt;ทดสอบ&gt;'));
 assert.ok(text.includes('=HYPERLINK(&quot;https://example.com&quot;)'));
 assert.ok(!text.includes('<f>'));assert.ok(!text.includes('98765'));assert.ok(!text.includes('externalLink'));
});
test('missing data stays blank and empty items do not create invalid filters',()=>{
 const sheets=salesOrderSheets({items:[]},null,'en');
 assert.equal(sheets[0].rows.find(r=>r[0]==='Total')[1],null);
 assert.equal(sheets[1].filter,false);
 assert.ok(!new TextDecoder().decode(salesOrderXlsx({items:[]})).includes('NaN'));
});
