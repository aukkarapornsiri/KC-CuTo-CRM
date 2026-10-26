import test from 'node:test';
import assert from 'node:assert/strict';
import {costSheetHTML} from '../src/sales-order-print.mjs';
const order={code:'SO-1',items:[]},png='data:image/png;base64,aGVsbG8=';
test('Cost Sheet uses central font and only the approved snapshot',()=>{
 const context={template:{design_options:{font:'CordiaUPC'}},approval:{status:'approved',reviewer_name:'A <B>',reviewed_at:'2026-10-26T10:00:00Z'},signature:png};
 const html=costSheetHTML(order,{},'en',context);
 assert.match(html,/font:10px\/1.35 CordiaUPC, Tahoma, sans-serif/);
 assert.ok(html.includes('src="'+png+'"'));assert.ok(html.includes('A &lt;B&gt;'));
 assert.ok(!costSheetHTML(order,{},'en',{...context,approval:{status:'pending'}}).includes('Approver signature'));
 assert.ok(!costSheetHTML(order,{},'en',{...context,signature:'javascript:alert(1)'}).includes('javascript:'));
 assert.match(costSheetHTML(order,{},'en',{template:{design_options:{font:'Arial'}}}),/font:10px\/1.35 Arial, sans-serif/);
});
