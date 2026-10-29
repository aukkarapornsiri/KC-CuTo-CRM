import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function setup(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema cron;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table public.profiles(id uuid primary key,manager_id uuid,is_super_admin boolean default false,is_active boolean default true);
create function private.crm_active_user(p_user uuid default auth.uid()) returns boolean language sql as $$select exists(select 1 from public.profiles where id=p_user and is_active)$$;
create function private.crm_can(text,text) returns boolean language sql as $$select private.crm_active_user() and ( $1<>'settings' or exists(select 1 from public.profiles where id=auth.uid() and is_super_admin))$$;
create function private.crm_assignment_eligible(uuid,text) returns boolean language sql as $$select private.crm_active_user($1)$$;
create table public.quotations(id uuid primary key,code text,customer_id uuid,customer_name text,owner_id uuid,owner_name text,project_name text,total numeric,currency text,status text,approval_status text,valid_until date,created_at timestamptz default now());
create table public.activities(id uuid primary key default gen_random_uuid(),type text,subject text,customer_id uuid,customer_name text,owner_id uuid,owner_name text,scheduled_at timestamptz,reminder_at timestamptz,status text,related_module text,related_id uuid,next_action text,description text,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text,related_module text,related_id uuid,event_kind text,event_key text,priority text,resolved_at timestamptz,resolution text,created_at timestamptz default now());
create unique index notification_unique on public.notifications(user_id,event_key) where event_key is not null;
create table public.crm_notification_email_queue(id uuid primary key default gen_random_uuid(),notification_id uuid unique,user_id uuid,subject text,body text,related_module text,related_id uuid,status text default 'pending',error text,created_at timestamptz default now());
create table public.crm_email_sender(id boolean,provider text,notifications_enabled boolean,verified_at timestamptz,activated_at timestamptz);
insert into public.crm_email_sender values(true,'microsoft_graph',true,now(),now());
grant usage on schema public,private,auth to authenticated;grant select on public.quotations,public.profiles,public.activities to authenticated;grant execute on all functions in schema private,auth to authenticated;
insert into profiles(id,manager_id,is_super_admin) values('${id(1)}',null,true),('${id(2)}',null,false),('${id(3)}','${id(2)}',false),('${id(4)}',null,false);
`);let sql=fs.readFileSync('db/quotation-followup.sql','utf8').split('-- Integrate with existing queues;')[0];await db.exec(sql);await db.exec(`select set_config('request.jwt.claim.sub','${id(3)}',false);insert into quotations(id,code,owner_id,owner_name,status,approval_status,valid_until,total,currency) values('${id(10)}','Q1','${id(3)}','Sales','draft','approved',current_date+2,100,'THB'),('${id(11)}','Q2','${id(4)}','Other','draft','approved',current_date+2,200,'THB');`);return db;}
test('follow-up lifecycle, optimistic locking, retry idempotency and document isolation',async()=>{const db=await setup();try{
 await db.exec(`update quotations set status='sent' where id='${id(10)}'`);
 assert.equal((await db.query('select count(*)::int n from activities')).rows[0].n,1);
 await db.exec(`update quotations set status='sent' where id='${id(10)}'`);assert.equal((await db.query('select count(*)::int n from activities')).rows[0].n,1);
 await assert.rejects(db.exec(`select public.crm_quotation_followup_save('${id(10)}','waiting','Called',null,1,'${id(20)}')`),/future next/);
 await assert.rejects(db.exec(`update activities set status='completed'`),/Quotation Follow-up|next date/);
 await db.exec(`select public.crm_quotation_followup_save('${id(10)}','negotiating','Called',now()+interval '2 days',1,'${id(20)}')`);
 await db.exec(`select public.crm_quotation_followup_save('${id(10)}','negotiating','Called',now()+interval '2 days',1,'${id(20)}')`);
 assert.equal((await db.query('select count(*)::int n from activities')).rows[0].n,2);
 assert.equal((await db.query("select count(*)::int n from activities where status='planned'")).rows[0].n,1);
 await assert.rejects(db.exec(`select public.crm_quotation_followup_save('${id(10)}','won','Won',null,1,'${id(21)}')`),/Record changed/);
 await db.exec(`select public.crm_quotation_followup_save('${id(10)}','won','Won',null,2,'${id(21)}')`);
 assert.deepEqual((await db.query(`select status,approval_status,total::int from quotations where id='${id(10)}'`)).rows[0],{status:'sent',approval_status:'approved',total:100});
 assert.equal((await db.query("select count(*)::int n from activities where status='planned'")).rows[0].n,0);
 }finally{await db.close();}});
test('RLS list and mutation enforce owner, manager, unrelated user, inactive and anonymous boundaries',async()=>{const db=await setup();try{
 await db.exec('set role authenticated');assert.equal((await db.query('select count(*)::int n from crm_quotation_followup_list')).rows[0].n,1);
 await assert.rejects(db.exec(`select crm_quotation_followup_save('${id(11)}','waiting','test',now()+interval '1 day',0,'${id(30)}')`),/outside your team/);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(2)}',false)`);assert.equal((await db.query('select count(*)::int n from crm_quotation_followup_list')).rows[0].n,1);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false)`);assert.equal((await db.query('select count(*)::int n from crm_quotation_followup_list')).rows[0].n,2);
 await db.exec(`reset role;update profiles set is_active=false where id='${id(3)}';set role authenticated;select set_config('request.jwt.claim.sub','${id(3)}',false)`);assert.equal((await db.query('select count(*)::int n from crm_quotation_followup_list')).rows[0].n,0);
 await db.exec(`reset role;set role anon`);await assert.rejects(db.exec(`select crm_quotation_followup_save('${id(10)}','won','x',null,0,'${id(30)}')`),/permission denied/);
 }finally{await db.close();}});
test('daily reminders deduplicate, honor channels, escalate and stop when closed',async()=>{const db=await setup();try{
 await db.exec(`update quotations set status='sent' where id='${id(10)}';update crm_quotation_followups set next_at=now()-interval '5 days';select private.crm_quotation_followup_reminders();select private.crm_quotation_followup_reminders();`);
 assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from crm_notification_email_queue')).rows[0].n,3);
 await db.exec(`update quotations set status='accepted' where id='${id(10)}';select private.crm_quotation_followup_reminders();`);
 assert.equal((await db.query("select count(*)::int n from notifications where resolved_at is null")).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from crm_notification_email_queue where status='pending'")).rows[0].n,0);
 assert.equal((await db.query("select private.crm_qf_business_date('2026-10-30 09:00+07',3)::text d")).rows[0].d,'2026-11-04 02:00:00+00');
 }finally{await db.close();}});

test('existing planned follow-up is reused on send, and legacy follow-up is completed on first update',async()=>{const db=await setup();try{await db.exec(`insert into activities(type,subject,owner_id,related_module,related_id,scheduled_at,status,description) values('Proposal Follow-up','Existing','${id(3)}','quotations','${id(10)}',now()+interval '1 day','planned','Original details');update quotations set status='sent' where id='${id(10)}'`);assert.equal((await db.query('select count(*)::int n from activities')).rows[0].n,1);assert.equal((await db.query('select description from activities')).rows[0].description,'Original details');await db.exec(`select crm_quotation_followup_save('${id(10)}','budget','New result',now()+interval '3 days',1,'${id(40)}')`);assert.equal((await db.query("select count(*)::int n from activities where status='completed'")).rows[0].n,1);}finally{await db.close();}});
