import test from 'node:test';
import assert from 'node:assert/strict';
import {EDIT_CONDITIONS,createDocumentEditSettings} from '../src/document-edit-policy.mjs';
import {createSOAmendments} from '../src/so-amendments.mjs';
import {createApprovalCenter} from '../src/approval-center.mjs';
const mock=values=>{let i=0;return {createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useEffect:()=>{},useRef:v=>({current:v}),useState:v=>[values[i++]??v,()=>{}]};};
const walk=n=>n&&typeof n==='object'?[n,...(n.children||[]).flat(Infinity).flatMap(walk)]:[];
test('two independent conditions save both booleans and the concurrency token',async()=>{
 const saved={quotation_requires_approval:true,so_requires_approval:true,updated_at:'version'},draft={...saved,quotation_requires_approval:false},calls=[];
 const R=mock([saved,draft,false,'','']);const C=createDocumentEditSettings({React:R,client:{rpc:async(name,args)=>{calls.push({name,args});return {data:draft};}},useApp:()=>({profile:{is_super_admin:true}})});
 const tree=C({lang:'en'});assert.deepEqual(walk(tree).filter(n=>n.props.role==='switch').map(n=>[n.props['aria-label'],n.props.checked]),[['Edit Approved Quotation',false],['Edit Approved Sales Order (SO)',true]]);
 const old=globalThis.window;globalThis.window={dispatchEvent(){}};try{await walk(tree).find(n=>n.type==='button'&&n.children.includes('Save conditions')).props.onClick();}finally{globalThis.window=old;}
 assert.deepEqual(calls[0].args.p_patch,{quotation_requires_approval:false,so_requires_approval:true,expected_updated_at:'version'});assert.equal(EDIT_CONDITIONS.length,2);
});
test('direct SO entry is available without a reason only when its condition is off',()=>{
 const R=mock([[],false,'',true,'',null,[],'','',false,null,{so_requires_approval:false}]);const C=createSOAmendments({React:R,client:{}});
 const tree=C({order:{id:'so',owner_id:'seller',status:'confirmed'},profile:{id:'seller'},can:()=>true,records:{},lang:'en'});
 const start=walk(tree).find(n=>n.type==='button'&&n.children.includes('Start direct edit'));assert.ok(start);assert.equal(start.props.disabled,false);
});
test('quotation edit request approves through its own RPC without asking for a document signature',async()=>{
 const selected={kind:'quotation_edit',id:'q',status:'pending',request:{id:'edit',requested_by:'seller',reason:'Adjust cost',status:'pending',approver_ids:['reviewer'],current_step:1},items:[]};const calls=[];const R=mock([[],'pending','all','',selected,'Allowed',false,false,'','']);
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{}};},from:()=>{const q=new Proxy({then:r=>r({data:[]})},{get:(t,k)=>k==='then'?t.then:()=>q});return q;}};
 const Center=createApprovalCenter({React:R,client,useApp:()=>({profile:{id:'reviewer'}}),useAccess:()=>({can:()=>true}),records:{}});const tree=Center({lang:'en'});
 const old=globalThis.window;globalThis.window={dispatchEvent(){}};try{await walk(tree).find(n=>n.type==='button'&&n.children.includes('Authorize editing')).props.onClick();}finally{globalThis.window=old;}
 assert.equal(calls[0].name,'crm_quotation_edit_action');assert.equal(calls[0].args.p_request_id,'edit');
});
