import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTENDED_APPROVAL_TEMPLATES,templatePayload,templateCanReview} from '../src/approval-template-catalog.mjs';
import {createApprovalCenter} from '../src/approval-center.mjs';
test('each additional template has a typed payload and the display name cannot supply routing',()=>{
 const drafts={lead_merge:{source_id:'source'},lead_reassignment:{owner_id:'owner'},so_cancellation:{},credit_terms:{credit_days:'45',credit_limit:'200000'},contract_amendment:{name:'Service',product:'Support',value:'500',start_date:'2026-01-01',end_date:'2026-12-31',sla_level:'Gold'},contract_renewal:{end_date:'2027-12-31',value:'550'},inventory_adjustment:{warehouse_id:'warehouse',serial_number:'',quantity:'-2'},special_purchase:{supplier:'Supplier',items:[{name:'Part',qty:'2',unit_cost:'80'}]}};
 assert.equal(EXTENDED_APPROVAL_TEMPLATES.length,8);
 for(const t of EXTENDED_APPROVAL_TEMPLATES){assert.ok(t.table);const p=templatePayload(t.id,{...drafts[t.id],request_type:'fake',name:drafts[t.id].name||'A renamed policy'});assert.equal(p.request_type,undefined);}
 assert.deepEqual(templatePayload('credit_terms',drafts.credit_terms),{credit_days:45,credit_limit:200000});
 assert.equal(templatePayload('inventory_adjustment',drafts.inventory_adjustment).quantity,-2);
 assert.equal(templatePayload('special_purchase',drafts.special_purchase).items[0].unit_cost,80);
 assert.throws(()=>templatePayload('credit_terms',{credit_days:'',credit_limit:1}),/Invalid number/);
 assert.throws(()=>templatePayload('special_purchase',{items:[{name:'Part',qty:-1,unit_cost:2}]}),/Invalid purchase/);
 assert.throws(()=>templatePayload('A renamed policy',{}),/Unknown/);
});
test('only the current independent approver can review a pending template request',()=>{
 const r={status:'pending',requested_by:'seller',current_step:2,approver_ids:['one','two']};assert.equal(templateCanReview(r,'two'),true);
 for(const id of ['seller','one','other'])assert.equal(templateCanReview(r,id),false);
 assert.equal(templateCanReview({...r,status:'approved'},'two'),false);assert.equal(templateCanReview({...r,requested_by:'two'},'two'),false);
});
test('template decisions use their own guarded RPC, version token and no document signature',async()=>{
 const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};
 try{
  const calls=[],selected={kind:'template',id:'target',template_type:'credit_terms',status:'pending',request:{id:'request',status:'pending',requested_by:'seller',approver_ids:['reviewer'],current_step:1,updated_at:'version',payload:{credit_days:45},before_snapshot:{}}};let i=0;
  const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useState:v=>{const n=i++;return [n===4?selected:n===5?'Reviewed':typeof v==='function'?v():v,()=>{}];},useEffect:()=>{},useRef:v=>({current:v})};
  const client={from:()=>{throw Error('Document signature must not be read');},rpc:async(name,args)=>{calls.push({name,args});return {data:{}};}};
  const Center=createApprovalCenter({React,client,useApp:()=>({profile:{id:'reviewer'}}),useAccess:()=>({can:()=>true}),records:{}}),tree=Center({lang:'en'}),nodes=[];
  const walk=n=>{if(!n||typeof n!=='object')return;nodes.push(n);(n.children||[]).forEach(walk);};walk(tree);
  nodes.find(n=>n.type==='button'&&n.children.includes('Approve this step')).props.onClick();await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(calls,[{name:'crm_template_decide',args:{p_id:'request',p_action:'approve',p_note:'Reviewed',p_expected_updated_at:'version'}}]);
 }finally{globalThis.window=original;}
});
