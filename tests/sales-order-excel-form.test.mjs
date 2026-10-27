import test from 'node:test';
import assert from 'node:assert/strict';
import {salesOrderXlsx} from '../src/sales-order-excel.mjs';
import {salesOrderForm} from '../src/sales-order-excel-form.mjs';
const order={code:'SO-TEST',subtotal:42000,discount:0,total:44940,vat:2940,tax_id:'0012345678901',items:[{name:'Laptop',desc:'Display\nRAM\nStorage',part_number:'000123',qty:1,unit:'Unit',price:42000,total:42000,cost:99999}]};
const financial={line_financials:[{cost_total:39483,gp:2517,margin:5.99}]};
const text=bytes=>new TextDecoder().decode(bytes);
test('single landscape print form has identifiers, numeric financials and approval boxes',()=>{
 const x=text(salesOrderXlsx(order,null,'th',{includeFinancial:true,financial}));
 for(const v of ['Cost Sheet · ใบสั่งขาย','Part Number','000123','0012345678901','<v>39483</v>','<v>2517</v>','<v>44940</v>','01 PREPARED BY','04 RELEASE TO OPS','orientation="landscape"','fitToWidth="1"','_xlnm.Print_Area','_xlnm.Print_Titles'])assert.ok(x.includes(v),v);
 assert.ok(!x.includes('sheet2.xml'));assert.ok(!x.includes('99999'));
});
test('financial information needs explicit permission and missing costs remain unknown',()=>{
 const x=text(salesOrderXlsx(order,null,'en',{financial}));
 assert.ok(!x.includes('39483'));assert.ok(!x.includes('2517'));assert.ok(!x.includes('Total inventory cost'));
 const missing=salesOrderForm(order,null,'en',{includeFinancial:true,financial:{line_financials:[]}});
 assert.ok(!missing.sheet.includes('<v>39483</v>'));assert.ok(!missing.sheet.includes('NaN'));
});
test('only approved snapshot signature is embedded; pending and remote URLs are excluded',()=>{
 const signature='data:image/png;base64,iVBORw0KGgo=';
 const approved=text(salesOrderXlsx(order,{status:'approved',reviewer_name:'QA reviewer'},'en',{signature}));
 assert.ok(approved.includes('xl/media/signature.png'));assert.ok(approved.includes('QA reviewer'));assert.ok(approved.includes('drawing1.xml'));
 assert.ok(!text(salesOrderXlsx(order,{status:'pending'},'en',{signature})).includes('xl/media/'));
 assert.ok(!text(salesOrderXlsx(order,{status:'approved'},'en',{signature:'https://example.com/signature.png'})).includes('xl/media/'));
});
test('long specifications preserve all text in bounded rows',()=>{
 const form=salesOrderForm({...order,items:[{...order.items[0],desc:'Spec line\n'.repeat(80)+'LAST-SPEC'}]},null,'en',{includeFinancial:true,financial});
 assert.ok(form.sheet.includes('LAST-SPEC'));assert.ok(form.lastRow>80);assert.ok(!form.sheet.includes('ht="409"'));
});
