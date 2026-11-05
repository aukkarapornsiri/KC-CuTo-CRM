import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKFLOW_TEMPLATES,applyWorkflowTemplate} from '../src/settings-workspace.mjs';
test('templates map all twelve supported workflows independently of the policy display name',()=>{
 assert.deepEqual(WORKFLOW_TEMPLATES.map(t=>t.id),['quotation','so','quotation_edit','amendment','lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase']);
 for(const t of WORKFLOW_TEMPLATES){const d=applyWorkflowTemplate({name:'',minimum_amount:'',approver_ids:[]},t.id);assert.equal(d.request_type,t.id);assert.equal(d.name,t.name);assert.equal(d.minimum_amount,0);assert.ok(t.flow_th);assert.ok(t.flow_en);}
});
test('a custom name never changes routing; changing a template replaces only its generated name',()=>{
 const draft={name:'',minimum_amount:'',approver_ids:[]};const q=applyWorkflowTemplate(draft,'quotation');const so=applyWorkflowTemplate(q,'so');assert.equal(so.name,'Approve Sales Order (SO)');
 const custom=applyWorkflowTemplate({...so,name:'Sales Team Workflow'},'amendment');assert.equal(custom.request_type,'amendment');assert.equal(custom.name,'Sales Team Workflow');
 assert.equal(applyWorkflowTemplate(custom,'unsupported').request_type,'');
});
