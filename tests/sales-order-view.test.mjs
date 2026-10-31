import test from 'node:test';
import assert from 'node:assert/strict';
import {filterOrders,orderMetrics} from '../src/sales-order-view.mjs';
const now=new Date('2026-10-31T20:00:00Z'); // Bangkok November 1
const rows=[{id:'1',code:'SO-1',quotation_code:'QT-22',po_number:'PO-X',customer_name:'KONE',owner_id:'u1',status:'confirmed',expected_delivery_date:'2026-10-31'},{id:'2',code:'SO-2',owner_id:'u2',status:'delivered',expected_delivery_date:'2026-10-31'},{id:'3',owner_id:'u1',status:'confirmed',expected_delivery_date:'2026-11-01'}];
const approvals={'1':{status:'pending'},'3':{status:'approved'}};
test('shared references, ownership, approval and due filters compose',()=>{
 assert.deepEqual(filterOrders(rows,{query:'qt-22',scope:'mine',userId:'u1',approval:'pending',due:'overdue'},approvals,now).map(r=>r.id),['1']);
 assert.equal(filterOrders(rows,{scope:'mine'},approvals,now).length,0);
 assert.deepEqual(filterOrders(rows,{due:'today'},approvals,now).map(r=>r.id),['3']);
 assert.deepEqual(filterOrders(rows,{due:'month'},approvals,now).map(r=>r.id),['3']);
 assert.equal(filterOrders(rows,{approval:'none'},approvals,now)[0].id,'2');
});
test('metrics cover every matching row and exclude delivered overdue orders',()=>{
 assert.deepEqual(orderMetrics(rows,approvals,now),{total:3,pending:1,delivery:2,overdue:1});
 assert.equal(orderMetrics(Array.from({length:123},(_,i)=>({...rows[0],id:String(i)})),{},now).total,123);
});
