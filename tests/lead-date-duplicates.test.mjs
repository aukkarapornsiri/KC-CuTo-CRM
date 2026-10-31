import test from 'node:test';
import assert from 'node:assert/strict';
import {formatLeadDate} from '../src/lead-workflow.mjs';
import {createInternalWorkspace,DEMO_RECORDS} from '../src/internal-workspace.mjs';
test('lead dates use Bangkok day boundaries and safely handle missing dates',()=>{
 assert.equal(formatLeadDate('2026-10-19T18:00:00Z'),'20/10/2026');
 for(const value of [null,'','invalid'])assert.equal(formatLeadDate(value),'—');
});
test('duplicate review opens the editor and never deletes source records',async()=>{
 globalThis.window={dispatchEvent(){},confirm:()=>false};
 const records=[{id:'a',code:'LD-1',company_name:'Same',updated_at:'2026-10-20',created_at:'2026-10-20'},{id:'b',code:'LD-2',company_name:'Same',updated_at:'2026-10-20',created_at:'2026-10-20'}];
 DEMO_RECORDS.leads=structuredClone(records);
 const state=[];let cursor=0;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef:v=>({current:v}),useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn};
 let demoMode=true;
 const Workspace=createInternalWorkspace({React,client:{},useApp:()=>({demoMode,profile:{id:'user'},navigate(){}}),useAccess:()=>({can:()=>false})});
 const Inner=Workspace({lang:'th',entity:'leads',route:'lead-inbox'}).type;state.length=0;
 const render=()=>{cursor=0;return Inner({lang:'th',entity:'leads',route:'lead-inbox'});};
 const flatten=node=>node&&typeof node==='object'?[node,...(node.children||[]).flatMap(flatten)]:[];
 render();state[0]=structuredClone(records);state[4]=true;state[15]=true;
 let nodes=flatten(render());
 assert.deepEqual(nodes.filter(n=>n.type==='th').slice(0,2).map(n=>n.children[0]),['วันที่สร้าง','รหัส']);
 const button=nodes.find(n=>n.props['aria-label']==='ตรวจและรวมลีด LD-1');assert.ok(button);
 await button.props.onClick();assert.deepEqual(DEMO_RECORDS.leads,records);
 demoMode=false;state[0]=structuredClone(records);
 assert.equal(flatten(render()).filter(n=>n.props.className==='crm-lead-delete').length,0);
 DEMO_RECORDS.leads=[];
});
