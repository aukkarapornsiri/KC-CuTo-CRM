import test from 'node:test';
import assert from 'node:assert/strict';
import {canConvertQuotation,validatePO} from '../src/sales-orders.mjs';
import {salesOrderHTML} from '../src/sales-order-print.mjs';
test('draft and approved quotations use a single SO approval',()=>{
 for(const status of ['draft','approved','sent','accepted'])assert.equal(canConvertQuotation({status,approval_status:'approved'}),true);
 assert.equal(canConvertQuotation({status:'draft',approval_status:null}),true);
 for(const q of [{status:'rejected'},{status:'submitted',approval_status:'pending'},{status:'draft',approval_status:'rejected'},{status:'expired',approval_status:'approved'},{}])assert.equal(canConvertQuotation(q),false);
});
test('PO metadata and attachment required with coherent delivery date',()=>{
 const valid={po_number:'PO-001',po_date:'2026-01-01',po_file_key:'user/file.pdf'};
 assert.doesNotThrow(()=>validatePO(valid));
 for(const change of [{po_number:''},{po_date:''},{po_date:'9999-01-01'},{po_file_key:''},{expected_delivery_date:'2025-12-31'}])assert.throws(()=>validatePO({...valid,...change}));
});
test('SO print preserves snapshot and escapes customer-controlled HTML',()=>{
 const html=salesOrderHTML({code:'SO-1',customer_name:'<script>alert(1)</script>',billing_address:'Original address',items:[{name:'<img src=x>',qty:1,price:100,total:100}],status:'cancelled',total:107,currency:'THB'},'en');
 assert.ok(html.includes('Original address'));assert.ok(html.includes('CANCELLED'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x>'));
});
