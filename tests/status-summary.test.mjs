import test from 'node:test';import assert from 'node:assert/strict';
import {statusSummary} from '../src/status-summary.mjs';
test('status counts use page-specific statuses, keep zero counts and include legacy values',()=>{
 const lead=statusSummary('leads',[{status:'new'},{status:'assign'},{status:'assign'},{status:'legacy'}]);
 assert.equal(lead.find(x=>x.status==='assign').count,2);assert.equal(lead.find(x=>x.status==='converted').count,0);assert.equal(lead.find(x=>x.status==='legacy').count,1);assert.equal(lead.reduce((sum,x)=>sum+x.count,0),4);
 const accounts=statusSummary('customers',[{status:'Active'},{status:'active'},{status:''}]);assert.equal(accounts.find(x=>x.status==='Active').count,2);assert.equal(accounts.find(x=>x.status==='').count,1);
 assert.deepEqual(statusSummary('contacts',[]),[{status:'active',count:0},{status:'inactive',count:0}]);
});

import {createStatusSummary} from '../src/status-summary.mjs';
const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
const flatten=n=>n&&typeof n==='object'?[n,...n.children.flatMap(flatten)]:[];
test('unavailable summaries never display zero; stale data is labelled and cards select status',()=>{
 const Component=createStatusSummary(React);const nodes=flatten(Component({entity:'leads',rows:[],ready:false,failed:true,lang:'en'}));assert.equal(nodes.filter(n=>n.type==='p'&&n.children[0]===0).length,0);assert.ok(nodes.some(n=>n.type==='p'&&n.children[0]==='—'));assert.ok(nodes.some(n=>n.children.includes('Load failed. Please reload.')));
 let selected=null;const ready=flatten(Component({entity:'leads',rows:[{status:'assign'},{status:'follow'}],ready:true,failed:true,updatedAt:Date.now(),lang:'en',selectedStatus:'assign',visibleCount:1,onSelectStatus:x=>selected=x}));const follow=ready.find(n=>n.props['data-summary-status']==='follow');follow.props.onClick();assert.equal(selected,'follow');assert.ok(ready.some(n=>n.children.includes('Refresh failed. Showing the previous counts.')));assert.equal(ready.find(n=>n.props['data-summary-status']==='assign').props['aria-pressed'],true);
});
