import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {canReviewSO} from '../src/approval-policy.mjs';
test('only the current configured reviewer may approve SO or revision',()=>{
 const request={status:'pending',requested_by:'seller',approver_ids:['first','second'],current_step:1};
 assert.equal(canReviewSO(request,'first',true),true);
 for(const id of ['second','other','seller',undefined])assert.equal(canReviewSO(request,id,true),false);
 assert.equal(canReviewSO(request,'first',false),false);
 assert.equal(canReviewSO({...request,approver_ids:[]},'first',true),false);
 assert.equal(canReviewSO({...request,current_step:2},'second',true),true);
 assert.equal(canReviewSO({...request,status:'approved'},'first',true),false);
});
test('database routes opening SO and revisions in order, blocks outsiders and self approval, preserves history and signatures',async()=>{
 const db=new PGlite();try{
  await db.exec(fs.readFileSync('tests/so-configured-approval-fixture.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261103113008_so_configured_approval_routing.sql','utf8'));
  await db.exec(fs.readFileSync('tests/so-configured-approval.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from crm_approval_policies')).rows[0].n,0);
 }finally{await db.close();}
});
