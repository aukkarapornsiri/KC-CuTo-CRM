import {test} from 'node:test';
import assert from 'node:assert/strict';
import {costSheetHTML} from '../src/sales-order-print.mjs';
const order={code:'SO-TEST',items:[{name:'Server',desc:'Spec <script>bad</script>\nPart Number: ABC-1',qty:2,price:100,total:190}],subtotal:200,discount:20,note:'Gift later\nSpare at office'};
test('Cost Sheet preserves spec, part, costs, GP and multiline terms with safe HTML',()=>{const html=costSheetHTML(order,{cost_total:120,gp_amount:60,gp_margin:33.33,line_financials:[{cost_total:120,gp:70,margin:36.84}]},'en');for(const text of ['ABC-1','120.00','60.00','70.00','36.84','Gift later\nSpare at office','A4 landscape','&lt;script&gt;'])assert.ok(html.includes(text),text);assert.ok(!html.includes('<script>'));assert.ok(html.includes('INTERNAL USE ONLY'));assert.ok(!html.includes('Quotation conditions'));});
test('Missing financials never display fabricated zero costs',()=>{const html=costSheetHTML(order,{},'th');assert.match(html,/—/);assert.ok(!html.includes('NaN'));});
