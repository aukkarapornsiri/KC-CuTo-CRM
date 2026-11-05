import {notificationTarget,notificationWorkLabel} from '../src/notification-center.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDate,newestNotifications,notificationText} from '../src/notification-center.mjs';
test('notification date shows Bangkok time without raw UTC text',()=>{assert.equal(notificationDate('2026-10-20T02:15:43Z'),'20/10/2026, 09:15');assert.equal(notificationDate('bad'),'—');});
test('newest work first, with stable ordering when timestamps match',()=>{const rows=[{id:'a',created_at:'2026-10-19'},{id:'b',created_at:'2026-10-20'},{id:'c',created_at:'2026-10-20'}];assert.deepEqual(newestNotifications(rows).map(x=>x.id),['c','b','a']);assert.equal(rows[0].id,'a');});
test('legacy assignment and approval notices follow selected language',()=>{assert.equal(notificationText({title:'โปรด Assign Lead: LD-2596',body:'กรุณาเลือกผู้รับลีด: Example'},'en').title,'Please assign lead: LD-2596');assert.equal(notificationText({title:'Quotation approved: SQ-1'},'th').title,'ใบเสนอราคาได้รับอนุมัติ: SQ-1');});
test('approval outcomes never appear as pending work',async()=>{const {notificationWorkLabel}=await import('../src/notification-center.mjs');assert.equal(notificationWorkLabel({event_kind:'approval_resolved'},'en'),'Approval result');assert.equal(notificationWorkLabel({title:'Quotation approved: SQ-1'},'th'),'แจ้งผลการอนุมัติแล้ว');assert.equal(notificationWorkLabel({event_kind:'approval_requested'},'en'),'Pending');assert.equal(notificationWorkLabel({resolved_at:'2026-10-30'},'en'),'Completed');});
test('SO notification opens its own approval, never its already-approved source quotation',async()=>{
 const {notificationTarget}=await import('../src/notification-center.mjs');
 const so='973eae44-de27-4934-b5d2-095e4673be45',quote='1204ac21-7183-4fca-a9b1-b510b73513ef';
 const row={event_kind:'approval_requested',event_key:`so-approval:${so}:1:pending:user`,related_module:'quotations',related_id:quote};
 assert.deepEqual(notificationTarget(row),{module:'quotations',page:'quot-approval',params:{approvalRecordId:so,approvalKind:'so'}});
 assert.equal(notificationTarget(row,(_m,a)=>a!=='approve'),null);
 assert.deepEqual(notificationTarget({...row,event_key:null,event_kind:'approval_request'}).params,{approvalRecordId:quote,approvalKind:'quotation'});
 assert.equal(notificationTarget({...row,event_key:null,event_kind:'assignment'}).page,'quot-list');
});
test('SO amendment notice opens the exact edit authorization instead of the source quotation',async()=>{
 const {notificationTarget}=await import('../src/notification-center.mjs'),id='19e8185a-e1df-40cb-b019-3e1e8fe8a3bb';
 const row={event_kind:'approval_requested',event_key:`so-amendment:${id}:pending:user`,related_module:'quotations',related_id:'1204ac21-7183-4fca-a9b1-b510b73513ef'};
 assert.deepEqual(notificationTarget(row),{module:'quotations',page:'quot-approval',params:{approvalRecordId:id,approvalKind:'amendment'}});
 assert.equal(notificationTarget(row,(_m,a)=>a!=='approve'),null);
 assert.equal(notificationTarget(row,(_m,a)=>a!=='view'),null);
 assert.equal(notificationTarget({...row,event_kind:'approval_resolved'}).page,'quot-list');
});

test('typed approvals deep-link to the universal reviewer without requiring quotation access',()=>{
 const id='11111111-1111-4111-8111-111111111111',row={event_key:'template:'+id+':1',related_module:'inventory',related_id:'22222222-2222-4222-8222-222222222222'};
 assert.deepEqual(notificationTarget(row,(m,a)=>m==='inventory'&&a==='view'),{module:'inventory',page:'template-approval',params:{approvalRecordId:id,approvalKind:'template'}});
 assert.equal(notificationTarget(row,()=>false),null);
 assert.equal(notificationWorkLabel({event_kind:'workflow_result'},'en'),'Approval result');
});

test('quotation edit notification opens its exact authorization and checks review access',()=>{
 const id='19e8185a-e1df-40cb-b019-3e1e8fe8a3bb',quote='1204ac21-7183-4fca-a9b1-b510b73513ef';
 const row={event_kind:'approval_requested',event_key:`quotation-edit:${id}:pending:1`,related_module:'quotations',related_id:quote};
 assert.deepEqual(notificationTarget(row).params,{approvalRecordId:id,approvalKind:'quotation_edit'});
 assert.equal(notificationTarget(row,(_m,a)=>a!=='approve'),null);
 assert.equal(notificationTarget({...row,event_kind:'approval_resolved'}).page,'quot-list');
});
