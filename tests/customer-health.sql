-- All synthetic records, alerts and audit writes are rolled back.
begin;
do $$ declare aid uuid; cid uuid:=gen_random_uuid(); cid2 uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); task uuid:=gen_random_uuid(); n integer; begin
 select id into aid from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;if aid is null then raise exception 'Active admin required';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',aid,'role','authenticated')::text,true);
 insert into public.customers(id,code,name,status,owner_id) values(cid,'HEALTH-QA-'||cid::text,'Synthetic health QA','Active',aid),(cid2,'HEALTH-QA-'||cid2::text,'Synthetic other QA','Active',aid);
 insert into public.contacts(id,name,first_name,last_name,customer_id,status,role,owner_id) values(ca,'QA Decision','QA','Decision',cid,'active','Decision Maker',aid),(cb,'QA Influencer','QA','Influencer',cid,'active','Influencer',aid);
 update public.contacts set reports_to_id=ca where id=cb;
 begin update public.contacts set reports_to_id=cb where id=ca;raise exception 'TEST_CYCLE_ALLOWED';exception when others then if sqlerrm='TEST_CYCLE_ALLOWED' or sqlerrm not like '%cycle%' then raise;end if;end;
 begin update public.contacts set customer_id=cid2 where id=ca;raise exception 'TEST_MOVE_ALLOWED';exception when others then if sqlerrm='TEST_MOVE_ALLOWED' or sqlerrm not like '%reporting contacts%' then raise;end if;end;
 insert into public.activities(id,type,subject,customer_id,owner_id,status,scheduled_at) values(task,'Call','Synthetic overdue customer task',cid,aid,'planned',now()-interval '2 days');
 perform private.crm_customer_health_reminders();perform private.crm_customer_health_reminders();
 select count(*) into n from public.notifications where event_kind='customer_health' and related_id=cid and user_id=aid and resolved_at is null;if n<>1 then raise exception 'Alert dedup failed';end if;
 update public.activities set status='completed' where id=task;perform private.crm_customer_health_reminders();
 if not exists(select 1 from public.notifications where event_kind='customer_health' and related_id=cid and resolution='risk_cleared' and resolved_at is not null) then raise exception 'Risk resolution failed';end if;
 update public.activities set status='planned' where id=task;perform private.crm_customer_health_reminders();
 select count(*) into n from public.notifications where event_kind='customer_health' and related_id=cid;if n<>1 then raise exception 'Reopened risk duplicated notification';end if;
 execute 'set local role authenticated';begin perform private.crm_customer_health_reminders();raise exception 'Client can run reminder job';exception when insufficient_privilege then null;end;execute 'reset role';
end $$;
rollback;
