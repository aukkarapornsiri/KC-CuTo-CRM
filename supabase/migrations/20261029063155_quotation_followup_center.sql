-- Dedicated follow-up state: document status, approval and financial fields are never written.
create table public.crm_quotation_followup_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 business_days integer not null default 3 check(business_days between 1 and 30),
 expiry_days integer not null default 3 check(expiry_days between 0 and 30),
 escalation_days integer not null default 3 check(escalation_days between 1 and 90),
 in_app boolean not null default true,email boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.crm_quotation_followup_settings(id) values(true);
alter table public.crm_quotation_followup_settings enable row level security;
create policy qf_settings_read on public.crm_quotation_followup_settings for select to authenticated using(private.crm_can('quotations','view'));
create policy qf_settings_update on public.crm_quotation_followup_settings for update to authenticated using(private.crm_can('settings','manage_settings')) with check(private.crm_can('settings','manage_settings'));
revoke all on public.crm_quotation_followup_settings from anon,authenticated;
grant select,update on public.crm_quotation_followup_settings to authenticated;

create table public.crm_quotation_followups (
 quotation_id uuid primary key references public.quotations(id) on delete cascade,
 status text not null default 'waiting' check(status in ('waiting','negotiating','budget','po','won','lost','cancelled')),
 sent_at timestamptz,
 last_result text not null default '',last_at timestamptz,
 next_at timestamptz,activity_id uuid references public.activities(id) on delete set null,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create index qf_next on public.crm_quotation_followups(next_at) where status not in ('won','lost','cancelled');
create table public.crm_quotation_followup_history (
 id uuid primary key default gen_random_uuid(),quotation_id uuid not null references public.quotations(id) on delete cascade,
 request_id uuid not null unique,status text not null,result text not null,next_at timestamptz,
 actor_id uuid references public.profiles(id),created_at timestamptz not null default now()
);
create index qf_history_quote on public.crm_quotation_followup_history(quotation_id,created_at desc);
-- Scope is checked in the database, including recursive reporting lines with cycle protection.
create function private.crm_qf_owner_visible(p_owner uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select private.crm_active_user(p_user) and (
 exists(select 1 from public.profiles where id=p_user and is_super_admin)
 or p_owner=p_user or exists(
 with recursive team(id,path) as (
 select id,array[p_user,id] from public.profiles where manager_id=p_user and id<>p_user
 union all select p.id,t.path||p.id from public.profiles p join team t on p.manager_id=t.id where not p.id=any(t.path)
 ) select 1 from team where id=p_owner))
$$;
revoke all on function private.crm_qf_owner_visible(uuid,uuid) from public,anon;
grant execute on function private.crm_qf_owner_visible(uuid,uuid) to authenticated;
alter table public.crm_quotation_followups enable row level security;
alter table public.crm_quotation_followup_history enable row level security;
create policy qf_read on public.crm_quotation_followups for select to authenticated using(private.crm_can('quotations','view') and exists(select 1 from public.quotations q where q.id=quotation_id and private.crm_qf_owner_visible(q.owner_id)));
create policy qf_history_read on public.crm_quotation_followup_history for select to authenticated using(private.crm_can('quotations','view') and exists(select 1 from public.quotations q where q.id=quotation_id and private.crm_qf_owner_visible(q.owner_id)));
revoke all on public.crm_quotation_followups,public.crm_quotation_followup_history from anon,authenticated;
grant select on public.crm_quotation_followups,public.crm_quotation_followup_history to authenticated;
-- All writes go through the bounded transaction below. No client INSERT/UPDATE grants.
create function private.crm_qf_business_date(p_start timestamptz,p_days integer) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare d timestamp:=p_start at time zone 'Asia/Bangkok';n integer:=0;
begin
 while n<p_days loop d:=d+interval '1 day';if extract(isodow from d)<6 then n:=n+1;end if;end loop;
 return d at time zone 'Asia/Bangkok';
end $$;
revoke all on function private.crm_qf_business_date(timestamptz,integer) from public,anon,authenticated;

create function private.crm_qf_schedule(q public.quotations,p_next timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
 if q.owner_id is null or not private.crm_assignment_eligible(q.owner_id,'activities') then raise exception 'Assign an active quotation owner with Activities access before scheduling';end if;
 insert into public.activities(type,subject,customer_id,customer_name,owner_id,owner_name,scheduled_at,reminder_at,status,related_module,related_id,next_action)
 values('Proposal Follow-up','ติดตามใบเสนอราคา / Quotation follow-up: '||q.code,q.customer_id,q.customer_name,q.owner_id,q.owner_name,p_next,p_next,'planned','quotations',q.id,'quotation-followup') returning id into aid;
 return aid;
end $$;
revoke all on function private.crm_qf_schedule(public.quotations,timestamptz) from public,anon,authenticated;

create function private.crm_qf_save(p_id uuid,p_status text,p_result text,p_next timestamptz,p_revision integer,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.quotations;f public.crm_quotation_followups;aid uuid;closed boolean;
begin
 if auth.uid() is null or not private.crm_can('quotations','edit') or not private.crm_can('activities','create') or not private.crm_can('activities','edit') then raise insufficient_privilege using message='Quotation edit and activity create/edit permissions required';end if;
 select * into q from public.quotations where id=p_id for update;
 if not found or not private.crm_qf_owner_visible(q.owner_id) then raise insufficient_privilege using message='Quotation unavailable or outside your team';end if;
 if p_request is null then raise exception 'Request ID required';end if;
 if exists(select 1 from public.crm_quotation_followup_history where request_id=p_request and quotation_id=p_id and actor_id=auth.uid()) then return (select to_jsonb(x) from public.crm_quotation_followups x where quotation_id=p_id);end if;
 if p_status is null or p_status not in ('waiting','negotiating','budget','po','won','lost','cancelled') then raise exception 'Invalid follow-up status';end if;
 if nullif(btrim(p_result),'') is null or length(p_result)>4000 then raise exception 'Enter a follow-up result (maximum 4000 characters)';end if;
 closed:=p_status in ('won','lost','cancelled');
 if not closed and (p_next is null or p_next<=now()) then raise exception 'An open follow-up requires a future next activity';end if;
 if q.status in ('accepted','rejected','cancelled') and not closed then raise exception 'This quotation is closed';end if;
 insert into public.crm_quotation_followups(quotation_id) values(p_id) on conflict do nothing;
 select * into f from public.crm_quotation_followups where quotation_id=p_id for update;
 if f.revision is distinct from p_revision then raise exception 'Record changed; reload before saving';end if;
 -- Swap the pointer before completing the old activity, so direct completion cannot bypass next-date validation.
 if not closed then aid:=private.crm_qf_schedule(q,p_next);end if;
 update public.crm_quotation_followups set status=p_status,last_result=btrim(p_result),last_at=now(),next_at=case when closed then null else p_next end,activity_id=aid,revision=revision+1,updated_at=now(),updated_by=auth.uid() where quotation_id=p_id;
 if f.activity_id is not null then update public.activities set status='completed',description=btrim(p_result),updated_at=now() where id=f.activity_id and status not in ('completed','cancelled');end if;
 insert into public.crm_quotation_followup_history(quotation_id,request_id,status,result,next_at,actor_id) values(p_id,p_request,p_status,btrim(p_result),case when closed then null else p_next end,auth.uid());
 update public.notifications set resolved_at=now(),resolution='followup_updated' where related_module='quotation_followups' and related_id=p_id and resolved_at is null;
 update public.crm_notification_email_queue set status='skipped',error='Follow-up updated' where related_module='quotation_followups' and related_id=p_id and status='pending';
 return (select to_jsonb(x) from public.crm_quotation_followups x where quotation_id=p_id);
end $$;
revoke all on function private.crm_qf_save(uuid,text,text,timestamptz,integer,uuid) from public,anon;
grant execute on function private.crm_qf_save(uuid,text,text,timestamptz,integer,uuid) to authenticated;
create function public.crm_quotation_followup_save(p_id uuid,p_status text,p_result text,p_next timestamptz,p_revision integer,p_request uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.crm_qf_save(p_id,p_status,p_result,p_next,p_revision,p_request)$$;
revoke all on function public.crm_quotation_followup_save(uuid,text,text,timestamptz,integer,uuid) from public,anon;
grant execute on function public.crm_quotation_followup_save(uuid,text,text,timestamptz,integer,uuid) to authenticated;

create view public.crm_quotation_followup_list with(security_invoker=true) as
 select q.id,q.code,q.customer_name,q.project_name,q.total,q.currency,q.owner_id,q.owner_name,q.status document_status,q.approval_status,q.valid_until,q.created_at,
 f.sent_at,coalesce(f.status,case when q.status='accepted' then 'won' when q.status='rejected' then 'lost' when q.status='cancelled' then 'cancelled' else 'waiting' end) followup_status,
 f.last_result,f.last_at,f.next_at,f.activity_id,coalesce(f.revision,0) revision,
 (coalesce(f.status,'waiting') not in ('won','lost','cancelled') and q.status not in ('accepted','rejected','cancelled')) is_open,
 (f.quotation_id is not null) tracked
 from public.quotations q left join public.crm_quotation_followups f on f.quotation_id=q.id
 where private.crm_can('quotations','view') and private.crm_qf_owner_visible(q.owner_id);
grant select on public.crm_quotation_followup_list to authenticated;

create function private.crm_qf_activity_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and (to_jsonb(old)->>'next_action'='quotation-followup' or to_jsonb(new)->>'next_action'='quotation-followup') then raise exception 'Use Quotation Follow-up to update this activity';end if;
 if tg_op='INSERT' then return new;end if;
 if exists(select 1 from public.crm_quotation_followups where activity_id=old.id and status not in ('won','lost','cancelled')) then
  if tg_op='DELETE' then raise exception 'Use Quotation Follow-up to close or reschedule this activity';end if;
  if new.status in ('completed','cancelled') or new.scheduled_at is distinct from old.scheduled_at or new.owner_id is distinct from old.owner_id or new.related_id is distinct from old.related_id or new.related_module is distinct from old.related_module then raise exception 'Update this activity through Quotation Follow-up and specify the next date';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.crm_qf_activity_guard() from public,anon,authenticated;
create trigger crm_qf_activity_guard before insert or update or delete on public.activities for each row execute function private.crm_qf_activity_guard();

create function private.crm_qf_quote_event() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.crm_quotation_followups;s public.crm_quotation_followup_settings;due timestamptz;aid uuid;
begin
 select * into s from public.crm_quotation_followup_settings where id;
 if new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into public.crm_quotation_followups(quotation_id,sent_at) values(new.id,now()) on conflict(quotation_id) do update set sent_at=coalesce(public.crm_quotation_followups.sent_at,excluded.sent_at);
  select * into f from public.crm_quotation_followups where quotation_id=new.id for update;
  if s.enabled and f.activity_id is null and f.status not in ('won','lost','cancelled') and new.owner_id is not null and private.crm_assignment_eligible(new.owner_id,'activities') then
   due:=private.crm_qf_business_date(now(),s.business_days);aid:=private.crm_qf_schedule(new,due);
   update public.crm_quotation_followups set next_at=due,activity_id=aid,revision=revision+1 where quotation_id=new.id;
  end if;
 end if;
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then
  select * into f from public.crm_quotation_followups where quotation_id=new.id for update;
  if f.activity_id is not null then
   update public.crm_quotation_followups set activity_id=null where quotation_id=new.id;
   if new.owner_id is not null and private.crm_assignment_eligible(new.owner_id,'activities') then
    update public.activities set owner_id=new.owner_id,owner_name=new.owner_name,updated_at=now() where id=f.activity_id;
    update public.crm_quotation_followups set activity_id=f.activity_id,revision=revision+1 where quotation_id=new.id;
   else
    update public.activities set status='cancelled',updated_at=now() where id=f.activity_id;
    update public.crm_quotation_followups set next_at=null,revision=revision+1 where quotation_id=new.id;
   end if;
  end if;
  update public.notifications set resolved_at=now(),resolution='owner_changed' where related_module='quotation_followups' and related_id=new.id and resolved_at is null;
  update public.crm_notification_email_queue set status='skipped',error='Owner changed' where related_module='quotation_followups' and related_id=new.id and status='pending';
 end if;
 if new.status in ('accepted','rejected','cancelled') and (tg_op='INSERT' or old.status is distinct from new.status) then
  select * into f from public.crm_quotation_followups where quotation_id=new.id for update;
  update public.crm_quotation_followups set status=case new.status when 'accepted' then 'won' when 'rejected' then 'lost' else 'cancelled' end,next_at=null,activity_id=null,revision=revision+1,updated_at=now() where quotation_id=new.id;
  update public.activities set status='cancelled',updated_at=now() where id=f.activity_id and status not in ('completed','cancelled');
  update public.notifications set resolved_at=now(),resolution='quotation_closed' where related_module='quotation_followups' and related_id=new.id and resolved_at is null;
  update public.crm_notification_email_queue set status='skipped',error='Quotation closed' where related_module='quotation_followups' and related_id=new.id and status='pending';
 end if;
 return new;
end $$;
revoke all on function private.crm_qf_quote_event() from public,anon,authenticated;
create trigger crm_qf_quote_event after insert or update on public.quotations for each row execute function private.crm_qf_quote_event();

-- One row per recipient/event/day; the existing email queue has a unique notification_id.
create function private.crm_qf_notify(p_user uuid,p_id uuid,p_kind text,p_key text,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare s public.crm_quotation_followup_settings;nid uuid;
begin
 perform 1 from public.quotations q join public.crm_quotation_followups f on f.quotation_id=q.id where q.id=p_id and q.status not in ('accepted','rejected','cancelled') and f.status not in ('won','lost','cancelled') for share of q,f;
 if not found then return;end if;
 select * into s from public.crm_quotation_followup_settings where id;
 if not s.enabled or not(s.in_app or s.email) or not private.crm_assignment_eligible(p_user,'quotations') or not exists(select 1 from public.quotations q where q.id=p_id and private.crm_qf_owner_visible(q.owner_id,p_user)) then return;end if;
 insert into public.notifications(user_id,type,title,body,related_module,related_id,event_kind,event_key,priority,resolved_at,resolution)
 values(p_user,'activity',case p_kind when 'qf_expiry' then 'ใบเสนอราคาใกล้หมดอายุ / Quotation expiring: ' when 'qf_escalation' then 'ทีมมีงานติดตามเกินกำหนด / Team follow-up overdue: ' else 'ถึงเวลาติดตามใบเสนอราคา / Quotation follow-up due: ' end||p_code,p_code,'quotation_followups',p_id,p_kind,p_key,'high',case when not s.in_app then now() end,case when not s.in_app then 'email_only' end)
 on conflict(user_id,event_key) where event_key is not null do nothing returning id into nid;
 if nid is not null and s.email and exists(select 1 from public.crm_email_sender where id and provider='microsoft_graph' and notifications_enabled and verified_at is not null) then
  insert into public.crm_notification_email_queue(notification_id,user_id,subject,body,related_module,related_id)
  select id,user_id,title,body,related_module,related_id from public.notifications where id=nid on conflict(notification_id) do nothing;
 end if;
end $$;
revoke all on function private.crm_qf_notify(uuid,uuid,text,text,text) from public,anon,authenticated;
create function private.crm_quotation_followup_reminders() returns void language plpgsql security definer set search_path='' as $$
declare r record;s public.crm_quotation_followup_settings;today date:=(now() at time zone 'Asia/Bangkok')::date;boss uuid;
begin
 select * into s from public.crm_quotation_followup_settings where id;
 if not s.enabled then return;end if;
 for r in select q.*,f.next_at,f.revision from public.crm_quotation_followups f join public.quotations q on q.id=f.quotation_id where f.status not in ('won','lost','cancelled') and q.status not in ('accepted','rejected','cancelled') loop
  if r.next_at<=now() then
   perform private.crm_qf_notify(r.owner_id,r.id,'qf_due','qf-due:'||r.id||':'||r.revision||':'||today,r.code);
   if (r.next_at at time zone 'Asia/Bangkok')::date<=today-s.escalation_days then
    select manager_id into boss from public.profiles where id=r.owner_id;
    perform private.crm_qf_notify(boss,r.id,'qf_escalation','qf-escalate:'||r.id||':'||r.revision||':'||today,r.code);
   end if;
  end if;
  if r.valid_until between today and today+s.expiry_days then
   perform private.crm_qf_notify(r.owner_id,r.id,'qf_expiry','qf-expiry:'||r.id||':'||r.valid_until||':'||today,r.code);
  end if;
 end loop;
end $$;
revoke all on function private.crm_quotation_followup_reminders() from public,anon,authenticated;
select cron.schedule('crm-quotation-followup-reminders','*/15 * * * *','select private.crm_quotation_followup_reminders()');

-- Integrate with existing queues; suppress the legacy duplicate reminder for tracked quotations.
CREATE OR REPLACE FUNCTION private.crm_queue_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.related_module='quotation_followups' then return new;end if;
 -- Informational new events stay in-app; never email an email-delivery failure.
 if new.resolved_at is not null or new.event_kind='delivery_failed' or (new.event_kind is not null and new.priority<>'high') then return new;end if;
 if new.user_id is not null and exists(select 1 from public.crm_email_sender where id and provider='microsoft_graph' and notifications_enabled and verified_at is not null and new.created_at>=activated_at)
 and private.crm_assignment_eligible(new.user_id,case when lower(new.related_module) in ('leads','customers','contacts','opportunities','quotations','contracts','assets','activities','tickets','documents','reports') then lower(new.related_module) else 'activities' end) then
 insert into public.crm_notification_email_queue(notification_id,user_id,subject,body,related_module,related_id) values(new.id,new.user_id,left(new.title,240),left(coalesce(new.body,''),4000),lower(new.related_module),new.related_id) on conflict(notification_id) do nothing;
 end if;return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.crm_notification_email_allowed(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.crm_notification_email_queue q WHERE q.id=p_id AND (q.related_module<>'quotation_followups' OR EXISTS(select 1 from public.crm_quotation_followups f join public.quotations z on z.id=f.quotation_id cross join public.crm_quotation_followup_settings s where s.id and s.enabled and s.email and f.quotation_id=q.related_id and f.status not in ('won','lost','cancelled') and z.status not in ('accepted','rejected','cancelled') and private.crm_qf_owner_visible(z.owner_id,q.user_id))) AND private.crm_assignment_eligible(q.user_id,CASE WHEN q.related_module='quotation_followups' THEN 'quotations' WHEN q.related_module IN ('leads','customers','contacts','opportunities','quotations','contracts','assets','activities','tickets','documents','reports') THEN q.related_module ELSE 'activities' END))
$function$
;
CREATE OR REPLACE FUNCTION private.crm_work_assignment_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE key text; recipient uuid; previous text; sent uuid[]:='{}'; rowdata jsonb:=to_jsonb(new); title text;
BEGIN
 IF tg_table_name='activities' AND rowdata->>'next_action'='quotation-followup' AND rowdata->>'related_module'='quotations' THEN RETURN new;END IF;
 title:=coalesce(nullif(rowdata->>'subject',''),nullif(rowdata->>'name',''),nullif(rowdata->>'company_name',''),nullif(rowdata->>'contact_name',''),rowdata->>'code','');
 FOREACH key IN ARRAY tg_argv LOOP
  recipient:=(rowdata->>key)::uuid; previous:=CASE WHEN tg_op='UPDATE' THEN to_jsonb(old)->>key ELSE NULL END;
  IF recipient IS NOT NULL AND recipient::text IS DISTINCT FROM previous AND NOT recipient=ANY(sent) AND private.crm_assignment_eligible(recipient,tg_table_name) THEN
   INSERT INTO public.notifications(user_id,type,title,body,related_module,related_id) VALUES(recipient,CASE WHEN tg_table_name='leads' THEN 'lead' ELSE 'activity' END,'ได้รับมอบหมาย: '||coalesce(rowdata->>'code',title),title,tg_table_name,new.id);
   sent:=array_append(sent,recipient);
  END IF;
 END LOOP;
 RETURN new;
END $function$
;
CREATE OR REPLACE FUNCTION private.crm_notification_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 for r in select * from public.activities where not exists(select 1 from public.crm_quotation_followups f where f.activity_id=activities.id) and created_at>=cutoff and lower(status) not in ('completed','done','cancelled','canceled') and scheduled_at<=now() loop
  perform private.crm_notify_once(r.owner_id,'activities',r.id,'activity_overdue','activity-overdue:'||r.id||':'||r.scheduled_at,'งานติดตามเกินกำหนด: '||r.subject,r.subject,true);
 end loop;
 for r in select * from public.opportunities where created_at>=cutoff and lower(status) not in ('won','lost','closed','cancelled') loop
  if r.close_date between today and today+7 then perform private.crm_notify_once(r.owner_id,'opportunities',r.id,'opportunity_due','opp-due:'||r.id||':'||r.close_date,'ใกล้วันปิดการขาย: '||r.code,r.code,true);end if;
  if r.updated_at<now()-interval '14 days' then perform private.crm_notify_once(r.owner_id,'opportunities',r.id,'opportunity_stale','opp-stale:'||r.id||':'||r.updated_at,'โอกาสการขายไม่มีความคืบหน้า: '||r.code,r.code,false);end if;
 end loop;
 for r in select * from public.quotations where not exists(select 1 from public.crm_quotation_followups f where f.quotation_id=quotations.id) and created_at>=cutoff and valid_until between today and today+7 and status not in ('accepted','rejected','cancelled','expired') loop
  perform private.crm_notify_once(r.owner_id,'quotations',r.id,'quotation_expiring','quote-expiry:'||r.id||':'||r.valid_until,'ใบเสนอราคาใกล้หมดอายุ: '||r.code,r.code,true);
 end loop;
 for r in select c.id,c.code,p.id as admin_id from public.contracts c cross join public.profiles p where c.created_at>=cutoff and coalesce(c.renewal_owner_id,c.owner_id) is null and c.end_date between today and today+30 and lower(c.status) not in ('cancelled','terminated','inactive','renewed') and p.is_super_admin and p.is_active loop
  perform private.crm_notify_once(r.admin_id,'contracts',r.id,'renewal_owner_missing','renewal-owner:'||r.id,'สัญญายังไม่มีผู้ดูแลต่ออายุ: '||r.code,r.code,true);
 end loop;
 for r in select * from public.crm_notification_email_queue where created_at>=cutoff and status='failed' loop
  perform private.crm_notify_once(r.user_id,coalesce(nullif(r.related_module,''),'activities'),r.related_id,'delivery_failed','delivery-failed:'||r.id,'ส่งอีเมลไม่สำเร็จ',r.subject,false);
 end loop;
end $function$
;


create policy qf_activity_scope on public.activities as restrictive for all to authenticated
 using(next_action is distinct from 'quotation-followup' or (private.crm_can('quotations','view') and exists(select 1 from public.quotations q where q.id=related_id and private.crm_qf_owner_visible(q.owner_id))))
 with check(next_action is distinct from 'quotation-followup' or (private.crm_can('quotations','view') and exists(select 1 from public.quotations q where q.id=related_id and private.crm_qf_owner_visible(q.owner_id))));

