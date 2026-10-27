import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUserProfile} from '../src/user-profile.mjs';
for(const mode of ['success','failure','conflict','demo'])test(`profile save navigation: ${mode}`,async()=>{
 const profile={id:'alice',first_name:'Alice',last_name:'Test',email:'alice@example.com'},states=[],refs=[],navigation=[],synced=[];let cursor=0,refCursor=0,resolve;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useRef(initial){const i=refCursor++;return refs[i]??=( {current:initial});},useEffect(){}};
 const query={update(){return this;},eq(){return this;},select(){return this;},maybeSingle:()=>new Promise(r=>resolve=r)};
 const Component=createUserProfile({React,client:{from:()=>query},useApp:()=>({profile,session:{user:{id:'alice'}},demoMode:mode==='demo',lang:'th',syncProfile:p=>synced.push(p),navigate:(...args)=>navigation.push(args)})});
 const render=()=>{cursor=0;refCursor=0;return Component({});};
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return;return predicate(node)?node:node.children?.flat(Infinity).map(n=>find(n,predicate)).find(Boolean);};
 find(render(),n=>n.props['aria-label']==='โปรไฟล์ผู้ใช้').props.onClick();
 find(render(),n=>n.type==='button'&&n.children.includes('แก้ไขโปรไฟล์')).props.onClick();
 const pending=find(render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
 if(mode!=='demo'){
  assert.deepEqual(navigation,[],'must wait for server confirmation');
  resolve(mode==='failure'?{error:{message:'Save failed'}}:{data:mode==='conflict'?null:profile});
 }
 await pending;
 if(mode==='success'||mode==='demo'){assert.deepEqual(navigation,[['dashboard','dashboard']]);assert.equal(synced.length,1);assert.equal(find(render(),n=>n.type==='form'),undefined);}
 else {assert.deepEqual(navigation,[]);assert.equal(synced.length,0);assert.ok(find(render(),n=>n.type==='form'));}
});
