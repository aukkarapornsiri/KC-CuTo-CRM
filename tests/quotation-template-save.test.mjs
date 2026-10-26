import test from 'node:test';
import assert from 'node:assert/strict';
import {saveQuotationTemplate,followsSharedQuotationTemplate,loadSharedQuotationTemplate} from '../src/quotation-template-save.mjs';
function clientFor({write,read,error=null}){const calls=[];return {calls,from(){let changed=false;const q={update(v){changed=true;calls.push(v);return q},insert(v){changed=true;calls.push(v);return q},eq(){return q},is(){return q},select(){return q},maybeSingle(){return Promise.resolve({data:write,error})},single(){return Promise.resolve({data:changed?write:read,error})}};return q}}}
const patch={id:'t',name:'Saved',design_options:{fontSize:16,font:'Tahoma'},company_email:'',updated_at:'2026-10-12T00:00:00Z'};
test('settings success requires independent read-back and preserves blank fields',async()=>{const c=clientFor({write:patch,read:{...patch,design_options:{font:'Tahoma',fontSize:16}}});assert.deepEqual(await saveQuotationTemplate(c,patch,{updated_at:'old'}),{...patch,design_options:{font:'Tahoma',fontSize:16}});assert.equal(c.calls[0].company_email,'');assert.equal('id' in c.calls[0],false)});
test('no affected row and read-back mismatch cannot report success',async()=>{await assert.rejects(saveQuotationTemplate(clientFor({write:null}),patch,{}));await assert.rejects(saveQuotationTemplate(clientFor({write:patch,read:{...patch,name:'Old'}}),patch,{}),/ตรวจสอบค่า/)});
test('database errors propagate',async()=>{await assert.rejects(saveQuotationTemplate(clientFor({error:Error('permission denied')}),patch,{}),/permission denied/)});

test('all users follow central templates for new/draft documents, including issued documents',()=>{assert.equal(followsSharedQuotationTemplate({}),true);assert.equal(followsSharedQuotationTemplate({id:'q',status:'draft'}),true);for(const q of [{status:'sent'},{status:'approved'},{status:'draft',approval_status:'pending'},{status:'draft',approval_status:'approved'}])assert.equal(followsSharedQuotationTemplate({id:'q',...q}),true);});


test('shared loader uses saved template exactly, never seed or snapshot',async()=>{const saved={id:'admin',company_name_th:'',design_options:{fontSize:14}};assert.deepEqual(await loadSharedQuotationTemplate(clientFor({write:saved})),saved);});
test('missing template and denied reads fail instead of returning a default',async()=>{await assert.rejects(loadSharedQuotationTemplate(clientFor({write:null})),/No shared/);await assert.rejects(loadSharedQuotationTemplate(clientFor({error:Error('denied')})),/denied/);});
