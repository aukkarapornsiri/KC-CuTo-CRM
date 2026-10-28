import test from 'node:test';
import assert from 'node:assert/strict';
import {activityLeadTarget} from '../src/activity-detail.mjs';
import {recordOptionLabel} from '../src/record-display.mjs';

test('activity navigation uses the explicit source lead and respects module access',()=>{
 const row={related_module:'leads',related_id:'lead-a',customer_id:'customer-b'};
 assert.equal(activityLeadTarget(row,true),'lead-a');
 assert.equal(activityLeadTarget(row,false),null);
 for(const record of [{},{related_module:'leads'},{related_module:'tickets',related_id:'lead-a'}])assert.equal(activityLeadTarget(record,true),null);
});
test('English activity labels localize legacy system text without changing names or notes',()=>{
 for(const [value,expected] of [['ติดตามลีด ACME','Follow up ACME'],['ติดตามลูกค้า: ACME','Follow up: ACME'],['ติดตาม ACME','Follow up ACME'],['ติดตาม','Follow-up']]){
  assert.equal(recordOptionLabel('activities','subject',value,'en'),expected);
  assert.equal(recordOptionLabel('activities','subject',value,'th'),value);
 }
 assert.equal(recordOptionLabel('activities','type','ติดตาม','en'),'Follow');
 assert.equal(recordOptionLabel('activities','type','ติดตามข้อเสนอ','en'),'Proposal follow up');
 assert.equal(recordOptionLabel('activities','description','ลูกค้าขอให้ติดตามพรุ่งนี้','en'),'ลูกค้าขอให้ติดตามพรุ่งนี้');
 assert.equal(recordOptionLabel('activities','subject','ติดตามลีด บริษัท ก','en'),'Follow up บริษัท ก');
 assert.equal(recordOptionLabel('leads','subject','ติดตาม ACME','en'),'ติดตาม ACME');
});
