alter table public.notifications add column if not exists resolved_at timestamptz;
alter table public.notifications add column if not exists resolution text;
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists event_kind text;
alter table public.notifications add column if not exists priority text not null default 'normal';
create unique index if not exists crm_notification_event_unique on public.notifications(user_id,event_key) where event_key is not null;
create index if not exists crm_notification_open_feed on public.notifications(user_id,created_at desc,id desc) where resolved_at is null;

-- Private trigger-only lookup: completion must work across all recipients, not only
-- the user making the source update. No callable public definer endpoint is added.
create or replace function private.crm_notification_done(n public.notifications)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when n.event_kind in ('delivery_failed','opportunity_result') then false
 when n.related_module='leads' then exists(select 1 from public.leads l where l.id=n.related_id and
  (case when n.title like 'โปรด Assign Lead:%' or n.event_kind='lead_assign' then
    (l.owner_id is not null and l.status not in ('new','review')) or l.status in ('converted','disqualified') or l.lead_assigner_id is distinct from n.user_id
   else l.status in ('contacted','follow','qualified','proposed','converted','disqualified') or (l.owner_id is distinct from n.user_id and n.event_kind is distinct from 'escalation') end))
 when n.related_module='activities' then exists(select 1 from public.activities a where a.id=n.related_id and (lower(a.status) in ('completed','done','cancelled','canceled') or a.owner_id is distinct from n.user_id and n.event_kind is distinct from 'escalation'))
 when n.related_module='quotations' and (n.title like 'Quotation approval:%' or n.event_kind='approval_request') then not exists(select 1 from public.crm_approval_requests r where r.quotation_id=n.related_id and r.status='pending' and r.approver_ids[r.current_step]=n.user_id)
 when n.related_module='quotations' and n.event_kind='quotation_expiring' then exists(select 1 from public.quotations q where q.id=n.related_id and (q.status in ('accepted','rejected','cancelled','expired') or q.valid_until>(now() at time zone 'Asia/Bangkok')::date+7))
 when n.related_module='contracts' then exists(select 1 from public.contracts c where c.id=n.related_id and (lower(c.status) in ('cancelled','canceled','terminated','inactive','renewed') or lower(c.renewal_status)='renewed' or (n.event_kind='renewal_owner_missing' and coalesce(c.renewal_owner_id,c.owner_id) is not null)))
 when n.related_module='opportunities' and n.event_kind in ('opportunity_due','opportunity_stale') then exists(select 1 from public.opportunities o where o.id=n.related_id and (lower(o.status) in ('won','lost','cancelled','closed') or (n.event_kind='opportunity_due' and o.close_date>(now() at time zone 'Asia/Bangkok')::date+7) or (n.event_kind='opportunity_stale' and o.updated_at>n.created_at)))
 when n.related_module='tickets' then exists(select 1 from public.tickets t where t.id=n.related_id and lower(t.status) in ('resolved','closed','cancelled','canceled'))
 else false end
$$;
revoke all on function private.crm_notification_done(public.notifications) from public,anon,authenticated;

create or replace function private.crm_resolve_record_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
declare mid text:=tg_table_name; rid uuid;
begin
 rid:=case when tg_op='DELETE' then old.id else new.id end;
 if mid='crm_approval_requests' then mid:='quotations';rid:=case when tg_op='DELETE' then old.quotation_id else new.quotation_id end;end if;
 update public.notifications n set resolved_at=now(),resolution=case when tg_op='DELETE' then 'record_removed' else 'completed' end
 where n.related_module=mid and n.related_id=rid and n.resolved_at is null and (tg_op='DELETE' or private.crm_notification_done(n));
 return null;
end $$;
revoke all on function private.crm_resolve_record_notifications() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['leads','activities','quotations','contracts','opportunities','tickets','crm_approval_requests'] loop
 execute format('drop trigger if exists crm_resolve_notifications on public.%I',t);
 execute format('create trigger crm_resolve_notifications after update or delete on public.%I for each row execute function private.crm_resolve_record_notifications()',t);
 end loop;
end $$;
-- Backfill completion only; this does not create or resend notifications.
update public.notifications n set resolved_at=now(),resolution='completed' where resolved_at is null and private.crm_notification_done(n);

-- New reminder rules start at deployment; do not blast historical imported data.
create table if not exists private.crm_notification_rollout(id boolean primary key default true check(id),started_at timestamptz not null default now());
revoke all on private.crm_notification_rollout from public,anon,authenticated;
insert into private.crm_notification_rollout(id) values(true) on conflict do nothing;
create or replace function private.crm_notify_once(recipient uuid,mod text,rid uuid,kind text,ekey text,subject text,detail text,urgent boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if recipient is null or not private.crm_assignment_eligible(recipient,mod) then return;end if;
 insert into public.notifications(user_id,type,title,body,related_module,related_id,event_kind,event_key,priority)
 values(recipient,case when mod='leads' then 'lead' when mod='contracts' then 'renewal' else 'activity' end,subject,detail,mod,rid,kind,ekey,case when urgent then 'high' else 'normal' end)
 on conflict(user_id,event_key) where event_key is not null do nothing;
end $$;
revoke all on function private.crm_notify_once(uuid,text,uuid,text,text,text,text,boolean) from public,anon,authenticated;
create or replace function private.crm_notification_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare r record; cutoff timestamptz;today date:=(now() at time zone 'Asia/Bangkok')::date;boss uuid;
begin
 select started_at into cutoff from private.crm_notification_rollout where id;
 -- Reconcile existing notices without changing their read state.
 update public.notifications n set resolved_at=now(),resolution='completed' where resolved_at is null and private.crm_notification_done(n);
 for r in select * from public.leads where created_at>=cutoff and created_at<=now()-interval '24 hours' and status in ('new','review','assign') loop
  perform private.crm_notify_once(coalesce(r.owner_id,r.lead_assigner_id),'leads',r.id,'lead_uncontacted','lead-uncontacted:'||r.id,'ลีดยังไม่ได้รับการติดต่อ: '||r.code,r.code,true);
  select manager_id into boss from public.profiles where id=coalesce(r.owner_id,r.lead_assigner_id);
  if r.created_at<=now()-interval '48 hours' then perform private.crm_notify_once(boss,'leads',r.id,'escalation','lead-escalation:'||r.id,'ลีดเกินกำหนดติดต่อ: '||r.code,r.code,true);end if;
 end loop;
 for r in select * from public.activities where created_at>=cutoff and lower(status) not in ('completed','done','cancelled','canceled') and scheduled_at<=now() loop
  perform private.crm_notify_once(r.owner_id,'activities',r.id,'activity_overdue','activity-overdue:'||r.id||':'||r.scheduled_at,'งานติดตามเกินกำหนด: '||r.subject,r.subject,true);
 end loop;
 for r in select * from public.opportunities where created_at>=cutoff and lower(status) not in ('won','lost','closed','cancelled') loop
  if r.close_date between today and today+7 then perform private.crm_notify_once(r.owner_id,'opportunities',r.id,'opportunity_due','opp-due:'||r.id||':'||r.close_date,'ใกล้วันปิดการขาย: '||r.code,r.code,true);end if;
  if r.updated_at<now()-interval '14 days' then perform private.crm_notify_once(r.owner_id,'opportunities',r.id,'opportunity_stale','opp-stale:'||r.id||':'||r.updated_at,'โอกาสการขายไม่มีความคืบหน้า: '||r.code,r.code,false);end if;
 end loop;
 for r in select * from public.quotations where created_at>=cutoff and valid_until between today and today+7 and status not in ('accepted','rejected','cancelled','expired') loop
  perform private.crm_notify_once(r.owner_id,'quotations',r.id,'quotation_expiring','quote-expiry:'||r.id||':'||r.valid_until,'ใบเสนอราคาใกล้หมดอายุ: '||r.code,r.code,true);
 end loop;
 for r in select c.id,c.code,p.id as admin_id from public.contracts c cross join public.profiles p where c.created_at>=cutoff and coalesce(c.renewal_owner_id,c.owner_id) is null and c.end_date between today and today+30 and lower(c.status) not in ('cancelled','terminated','inactive','renewed') and p.is_super_admin and p.is_active loop
  perform private.crm_notify_once(r.admin_id,'contracts',r.id,'renewal_owner_missing','renewal-owner:'||r.id,'สัญญายังไม่มีผู้ดูแลต่ออายุ: '||r.code,r.code,true);
 end loop;
 for r in select * from public.crm_notification_email_queue where created_at>=cutoff and status='failed' loop
  perform private.crm_notify_once(r.user_id,coalesce(nullif(r.related_module,''),'activities'),r.related_id,'delivery_failed','delivery-failed:'||r.id,'ส่งอีเมลไม่สำเร็จ',r.subject,false);
 end loop;
end $$;
revoke all on function private.crm_notification_reminders() from public,anon,authenticated;
select cron.schedule('crm-notification-center-reminders','*/15 * * * *','select private.crm_notification_reminders()');

create or replace function private.crm_notification_outcome()
returns trigger language plpgsql security definer set search_path='' as $$
declare boss uuid;
begin
 if tg_table_name='opportunities' and new.status is distinct from old.status and lower(new.status) in ('won','lost') then
  perform private.crm_notify_once(new.owner_id,'opportunities',new.id,'opportunity_result','opp-result:'||new.id||':'||new.updated_at,'ผลการปิดโอกาสการขาย: '||new.code,new.code||' · '||new.status,false);
  select manager_id into boss from public.profiles where id=new.owner_id;
  perform private.crm_notify_once(boss,'opportunities',new.id,'opportunity_result','opp-result:'||new.id||':'||new.updated_at,'ผลการปิดโอกาสการขาย: '||new.code,new.code||' · '||new.status,false);
 end if;
 return null;
end $$;
revoke all on function private.crm_notification_outcome() from public,anon,authenticated;
drop trigger if exists crm_notification_outcome on public.opportunities;
create trigger crm_notification_outcome after update on public.opportunities for each row execute function private.crm_notification_outcome();

create or replace function private.crm_queue_notification_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Informational new events stay in-app; never email an email-delivery failure.
 if new.resolved_at is not null or new.event_kind='delivery_failed' or (new.event_kind is not null and new.priority<>'high') then return new;end if;
 if new.user_id is not null and exists(select 1 from public.crm_email_sender where id and provider='microsoft_graph' and notifications_enabled and verified_at is not null and new.created_at>=activated_at)
 and private.crm_assignment_eligible(new.user_id,case when lower(new.related_module) in ('leads','customers','contacts','opportunities','quotations','contracts','assets','activities','tickets','documents','reports') then lower(new.related_module) else 'activities' end) then
 insert into public.crm_notification_email_queue(notification_id,user_id,subject,body,related_module,related_id) values(new.id,new.user_id,left(new.title,240),left(coalesce(new.body,''),4000),lower(new.related_module),new.related_id) on conflict(notification_id) do nothing;
 end if;return new;
end $$;
revoke all on function private.crm_queue_notification_email() from public,anon,authenticated;
