-- Run inside BEGIN/ROLLBACK. No HTTP requests or emails.
do $$
declare uid uuid;nid uuid;n integer;
begin
 select id into uid from public.profiles where is_active limit 1;
 if uid is null then raise exception 'An active fixture profile is required';end if;
 insert into public.notifications(user_id,type,title) values(uid,'system','mail-test-disabled') returning id into nid;
 if exists(select 1 from public.crm_notification_email_queue where notification_id=nid) then raise exception 'Disabled sender enqueued mail';end if;
 update public.crm_email_sender set verified_at=now(),activated_at=now()-interval '1 second',notifications_enabled=true where id;
 insert into public.notifications(user_id,type,title) values(uid,'system','mail-test-enabled') returning id into nid;
 if (select count(*) from public.crm_notification_email_queue where notification_id=nid)<>1 then raise exception 'Expected one queued email';end if;
 insert into public.notifications(user_id,type,title) values(null,'system','mail-test-broadcast');
 if (select count(*) from public.crm_notification_email_queue)<>1 then raise exception 'Null recipient must not fan out';end if;
 select count(*) into n from public.crm_notification_email_claim();if n<>1 then raise exception 'Claim expected one';end if;
 select count(*) into n from public.crm_notification_email_claim();if n<>0 then raise exception 'Claim repeated in-flight item';end if;
 update public.crm_notification_email_queue set claimed_at=now()-interval '6 minutes';
 perform public.crm_notification_email_claim();
 if exists(select 1 from public.crm_notification_email_queue where status<>'failed') then raise exception 'Unknown outcome retried';end if;
 if has_function_privilege('authenticated','public.crm_notification_email_claim()','EXECUTE') then raise exception 'Public worker claim access';end if;
 if has_table_privilege('authenticated','public.crm_notification_email_queue','INSERT') then raise exception 'Client queue write access';end if;
 raise notice '8 Microsoft mail queue checks passed';
end $$;
