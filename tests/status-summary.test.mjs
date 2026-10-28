import test from 'node:test';import assert from 'node:assert/strict';
import {statusSummary} from '../src/status-summary.mjs';
test('status counts use page-specific statuses, keep zero counts and include legacy values',()=>{
 const lead=statusSummary('leads',[{status:'new'},{status:'assign'},{status:'assign'},{status:'legacy'}]);
 assert.equal(lead.find(x=>x.status==='assign').count,2);assert.equal(lead.find(x=>x.status==='converted').count,0);assert.equal(lead.find(x=>x.status==='legacy').count,1);assert.equal(lead.reduce((sum,x)=>sum+x.count,0),4);
 const accounts=statusSummary('customers',[{status:'Active'},{status:'active'},{status:''}]);assert.equal(accounts.find(x=>x.status==='Active').count,2);assert.equal(accounts.find(x=>x.status==='').count,1);
 assert.deepEqual(statusSummary('contacts',[]),[{status:'active',count:0},{status:'inactive',count:0}]);
});
