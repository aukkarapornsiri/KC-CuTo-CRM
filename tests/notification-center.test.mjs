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
