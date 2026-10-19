import test from 'node:test';import assert from 'node:assert/strict';
import {assignmentTarget,RECORD_PAGES} from '../src/assignment-links.mjs';
import {notificationRecordUrl} from '../supabase/functions/_shared/assignment-link.mjs';
const id='11111111-2222-4333-8444-555555555555';
test('every assignment email opens the exact supported record',()=>{for(const module of Object.keys(RECORD_PAGES)){const url=new URL(notificationRecordUrl(module,id));assert.deepEqual(assignmentTarget(url.searchParams.get('module'),url.searchParams.get('record')),{module,page:RECORD_PAGES[module],params:{recordId:id}});}});
test('untrusted modules and identifiers cannot create external links or routes',()=>{for(const [module,record] of [['https://evil.example',id],['leads','javascript:alert(1)'],['settings',id]]){assert.equal(assignmentTarget(module,record),null);assert.equal(notificationRecordUrl(module,record),'https://kc-cuto.kaicomhub.com/');}});
