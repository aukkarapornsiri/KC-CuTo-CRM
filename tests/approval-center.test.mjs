import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canReviewQuotation,approvalCategory} from '../src/approval-center.mjs';
test('only the current policy approver can decide and self approval stays denied',()=>{
 const r={status:'pending',current_step:2,approver_ids:['first','second'],submitted_by:'seller',snapshot:{owner_id:'owner'}};
 assert.equal(canReviewQuotation(r,'second',true),true);
 for(const user of ['first','seller','owner','other'])assert.equal(canReviewQuotation(r,user,true),false);
 assert.equal(canReviewQuotation(r,'second',false),false);
 assert.equal(canReviewQuotation({...r,status:'approved'},'second',true),false);
 assert.equal(canReviewQuotation({...r,submitted_by:'second'},'second',true),false);
 assert.equal(canReviewQuotation({...r,snapshot:{owner_id:'second'}},'second',true),false);
});
test('work categories distinguish quotations, SO, services and future modules',()=>{
 assert.equal(approvalCategory('quotations'),'quotation');assert.equal(approvalCategory('crm_sales_orders'),'so');assert.equal(approvalCategory('tickets'),'service');assert.equal(approvalCategory('contracts'),'other');
});
