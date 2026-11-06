import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsWorkspace} from '../src/settings-workspace.mjs';
const nodes=n=>n&&typeof n==='object'?[n,...(n.children||[]).flat(Infinity).flatMap(nodes)]:[];
test('legacy approval menu and access tab use the identical policy editor',()=>{
 const React={Fragment:'fragment',cloneElement:(node,props)=>({...node,props:{...node.props,...props}}),createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useRef:v=>({current:v}),useEffect:()=>{},useState:v=>[v==='users'?'workflow':Array.isArray(v)&&v.length===1&&v[0]==='users'?['workflow']:v,()=>{}]};
 const workspace=createSettingsWorkspace({React,client:{},useAccess:()=>({can:()=>true}),useApp:()=>({demoMode:true,profile:{id:'qa',is_super_admin:true}})});
 const legacy=workspace.DataEditor({kind:'workflow',lang:'th'}),access=workspace.DataEditor({kind:'users',lang:'th'});
 const tree=access.type(access.props);assert.equal(nodes(tree).filter(n=>n.type===legacy.type).length,1);
 assert.equal(nodes(legacy.type(legacy.props)).some(n=>n.type==='h2'&&n.children.includes('นโยบายและขั้นตอนอนุมัติ')),true);
 assert.ok(nodes(tree).some(n=>n.props.id==='access-tab-workflow'&&n.children.includes('นโยบายและขั้นตอนอนุมัติ')));
});
