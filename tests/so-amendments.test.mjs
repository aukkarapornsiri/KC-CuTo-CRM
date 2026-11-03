import {test} from 'node:test';
import assert from 'node:assert/strict';
import {amendmentDraft,createSOAmendments} from '../src/so-amendments.mjs';
import {createApprovalCenter} from '../src/approval-center.mjs';
const order={id:'so',owner_id:'seller',created_by:'seller',status:'confirmed',updated_at:'2026-11-01T00:00:00Z',po_number:'PO',po_date:'2026-11-01',currency:'THB',subtotal:200,discount:30,vat:11.9,withholding_tax:5.1,items:[{name:'Original',qty:2,price:100,discount:20,total:180}]};
const walk=n=>n&&typeof n==='object'?[n,...(n.children||[]).flat(Infinity).flatMap(walk)]:[];
const tick=()=>new Promise(r=>setTimeout(r,20));
const ReactMock=values=>{let i=0;return {createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[values[i++]??v,()=>{}]};};
const clientMock=calls=>({rpc:async(name,args)=>{calls.push({name,args});await tick();return {data:name==='crm_save_so_amendment'?{id:'so'}:[],error:null}},from:()=>{const q=new Proxy({then:resolve=>resolve({data:[],error:null})},{get:(t,k)=>k==='then'?t.then:()=>q});return q;}});
test('revision draft preserves item identity and separates line/document discounts and tax rates',()=>{const d=amendmentDraft(order);assert.equal(d.document_discount,10);assert.equal(d.tax_rate,7);assert.equal(d.wht_rate,3);assert.equal(d.items[0].original_index,0);assert.notEqual(d.items[0],order.items[0]);});
test('request form sends reason and exact SO version once',async()=>{const calls=[],R=ReactMock([[],false,'',true,'Customer changed PO']);const C=createSOAmendments({React:R,client:clientMock(calls)});const tree=C({order,lang:'en',profile:{id:'seller'},can:()=>true,records:{},onSaved:()=>{}});const b=walk(tree).find(n=>n.type==='button'&&n.children.includes('Request SO amendment'));const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};try{const a=b.props.onClick(),b2=b.props.onClick();await Promise.all([a,b2]);assert.equal(calls.length,1);assert.equal(calls[0].args.p_expected_updated_at,order.updated_at);assert.equal(calls[0].args.p_note,'Customer changed PO');}finally{globalThis.window=original;}});
test('approved requester form renders line pricing and saves through guarded RPC',async()=>{const calls=[],request={id:'request',status:'approved',requested_by:'seller',reason:'Correct price'},R=ReactMock([[request],false,'',true,'',amendmentDraft(order),[],'','']);const C=createSOAmendments({React:R,client:clientMock(calls)});let saved;const tree=C({order,lang:'en',profile:{id:'seller'},can:()=>true,records:{},onSaved:id=>saved=id});assert.ok(walk(tree).find(n=>n.props['aria-label']==='Price 1'));const form=walk(tree).find(n=>n.type==='form');const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};try{await form.props.onSubmit({preventDefault(){}});assert.equal(calls[0].name,'crm_save_so_amendment');assert.equal(calls[0].args.p_request_id,'request');assert.equal(calls[0].args.p_patch.items[0].original_index,0);assert.equal(saved,'so');}finally{globalThis.window=original;}});
test('independent approver authorizes amendment through dedicated RPC without applying changes',async()=>{const selected={kind:'amendment',id:'so',status:'pending',request:{id:'request',requested_by:'seller',reason:'Correct price'},items:[]},calls=[],R=ReactMock([[], 'pending','all','',selected,'Allowed',false,false,'','']);const Center=createApprovalCenter({React:R,client:clientMock(calls),useApp:()=>({profile:{id:'reviewer'}}),useAccess:()=>({can:()=>true}),records:{}});const tree=Center({lang:'en'});const button=walk(tree).find(n=>n.type==='button'&&n.children.includes('Authorize editing'));assert.ok(button);const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};try{await button.props.onClick();await tick();assert.equal(calls[0].name,'crm_so_amendment_action');assert.equal(calls[0].args.p_action,'approve');assert.equal(calls[0].args.p_request_id,'request');}finally{globalThis.window=original;}});

test('quotation fallback exposes the exact pending amendment review action',async()=>{
 const {createSOAmendmentReviewShortcut}=await import('../src/so-amendments.mjs');
 const a={id:'request',reason:'Correct PO'},R=ReactMock([{id:'quote',request:a}]);let opened;
 const C=createSOAmendmentReviewShortcut({React:R,client:{}}),tree=C({quotationId:'quote',profileId:'reviewer',lang:'en',canApprove:true,onReview:id=>opened=id});
 walk(tree).find(n=>n.type==='button').props.onClick();assert.equal(opened,'request');
 const Hidden=createSOAmendmentReviewShortcut({React:ReactMock([]),client:{}});assert.equal(Hidden({quotationId:'quote',canApprove:false}),null);
});

test('direct amendment link loads the request by ID and renders authorization controls',async()=>{
 const a={id:'request',sales_order_id:'so',requested_by:'seller',status:'pending',reason:'Correct PO',before_snapshot:{quotation_id:'quote',code:'SO-1'}},effects=[],states=[],calls=[];let stateIndex=0;
 const R={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useRef:v=>({current:v}),useEffect:fn=>effects.push(fn),useState:v=>{const i=stateIndex++;return [v,x=>states[i]=x];}};
 const client={from:table=>{calls.push(table);let single=false;const q=new Proxy({then:resolve=>resolve({data:table==='crm_so_amendments'?(single?a:[a]):[],error:null})},{get:(t,k)=>k==='then'?t.then:(...args)=>{if(k==='maybeSingle')single=true;return q;}});return q;}};
 const C=createApprovalCenter({React:R,client,useApp:()=>({profile:{id:'reviewer'}}),useAccess:()=>({can:()=>true}),records:{}});C({lang:'en',initialRecordId:'request',initialKind:'amendment'});effects.forEach(fn=>fn());await tick();
 assert.equal(states[4]?.kind,'amendment');assert.equal(states[4]?.request.id,'request');assert.equal(states[4]?.id,'so');assert.ok(!calls.includes('quotations'));
});

test('authorized cost draft uses the SO snapshot rather than current catalog cost',()=>{
 const d=amendmentDraft(order,{line_financials:[{cost_total:150}]});assert.equal(d.items[0].cost,75);
 const recurring={...order,items:[{qty:2,cycle_count:3,billing_period:'month'},{qty:10,cycle_count:1,billing_period:'once'}]};
 const r=amendmentDraft(recurring,{line_financials:[{cost_total:180},{cost_total:500}]});assert.equal(r.items[0].cost,30);assert.equal(r.items[1].cost,500);
});
test('approved requester can open SO and Cost Sheet from the source quotation',async()=>{
 const {createSOAmendmentReviewShortcut}=await import('../src/so-amendments.mjs');let opened;
 const C=createSOAmendmentReviewShortcut({React:ReactMock([{id:'quote',request:{id:'request',status:'approved',sales_order_id:'so',requested_by:'seller'}}]),client:{}});
 const tree=C({quotationId:'quote',profileId:'seller',lang:'en',canApprove:false,canEdit:true,onEdit:id=>opened=id});
 walk(tree).find(n=>n.type==='button'&&n.children.includes('Edit SO / Cost Sheet')).props.onClick();assert.equal(opened,'so');
});
