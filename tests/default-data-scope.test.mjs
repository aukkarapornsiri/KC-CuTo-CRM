import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewByDefault,defaultDataScope} from '../src/default-data-scope.mjs';
test('leadership and administrators default to the permitted overview',()=>{
 for(const role of ['executive','sales_manager','sales_director','admin','super_admin','system_admin','it_admin','administrator']){
  assert.equal(defaultDataScope({role}),'all',role);
  assert.equal(defaultDataScope({role:'custom',custom_role_key:role}),'all','custom '+role);
 }
 assert.equal(defaultDataScope({role:'sales_user',is_super_admin:true}),'all');
});
test('salespeople and unrelated custom roles keep their personal default',()=>{
 for(const p of [null,{}, {role:'sales_user'},{role:'sales_coordinator'},{role:'custom',custom_role_key:'finance_manager'},{role:'custom',custom_role_key:'sales_user',display_name:'Executive'}])assert.equal(defaultDataScope(p),'mine');
});
test('inactive profiles cannot select overview through the default helper',()=>{
 for(const flag of [{is_active:false},{access_active:false},{deleted_at:'2026-11-05'},{deletion_requested_at:'2026-11-05'}])assert.equal(overviewByDefault({role:'admin',is_super_admin:true,...flag}),false);
});
