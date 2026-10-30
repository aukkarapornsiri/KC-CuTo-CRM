import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('SO backfill and triggers preserve pending work and resolve approved, rejected, superseded and deleted requests',async()=>{
 const db=new PGlite();const sid='00000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create table crm_sales_orders(id uuid primary key,status text);
 create table crm_so_approvals(sales_order_id uuid,revision int,status text);
 create table notifications(id serial,event_kind text,event_key text,related_module text,related_id uuid,resolved_at timestamptz,resolution text);
 insert into crm_sales_orders values('${sid}','draft');insert into crm_so_approvals values('${sid}',1,'pending');
 insert into notifications(event_kind,event_key) values('approval_requested','so-approval:${sid}:1:pending:user'),('approval_resolved','so-approval:${sid}:1:approved:user'),('assignment','other');`);
 await db.exec(fs.readFileSync('db/so-notification-completion.sql','utf8'));
 const open=async()=> (await db.query('select count(*)::int n from notifications where resolved_at is null')).rows[0].n;
 assert.equal(await open(),3);
 await db.exec("update crm_so_approvals set status='approved'");assert.equal(await open(),2);
 await db.exec("update notifications set resolved_at=null,resolution=null where id=1");
 await db.exec(fs.readFileSync('db/so-notification-completion.sql','utf8'));assert.equal(await open(),2);
 for(const action of ["update crm_so_approvals set status='rejected'","update crm_so_approvals set revision=2","update crm_sales_orders set status='cancelled'","delete from crm_so_approvals"]){
 await db.exec("update crm_sales_orders set status='draft';update crm_so_approvals set status='pending',revision=1;update notifications set resolved_at=null,resolution=null where id=1");
 await db.exec(action);assert.equal(await open(),2,action);
 }
 }finally{await db.close();}
});
