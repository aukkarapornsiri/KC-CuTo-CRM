create or replace function private.crm_qf_save(p_id uuid,p_status text,p_result text,p_next timestamptz,p_revision integer,p_request uuid) returns jsonb
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
 insert into public.crm_quotation_followups(quotation_id,activity_id) values(p_id,(select id from public.activities where related_module='quotations' and related_id=p_id and type='Proposal Follow-up' and status not in ('completed','cancelled') order by scheduled_at,id limit 1)) on conflict do nothing;
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

create or replace function private.crm_qf_quote_event() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.crm_quotation_followups;s public.crm_quotation_followup_settings;due timestamptz;aid uuid;
begin
 select * into s from public.crm_quotation_followup_settings where id;
 if new.status='sent' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into public.crm_quotation_followups(quotation_id,sent_at) values(new.id,now()) on conflict(quotation_id) do update set sent_at=coalesce(public.crm_quotation_followups.sent_at,excluded.sent_at);
  select * into f from public.crm_quotation_followups where quotation_id=new.id for update;
  if s.enabled and f.activity_id is null and f.status not in ('won','lost','cancelled') and new.owner_id is not null and private.crm_assignment_eligible(new.owner_id,'activities') then
   select id,scheduled_at into aid,due from public.activities where related_module='quotations' and related_id=new.id and type='Proposal Follow-up' and status not in ('completed','cancelled') order by scheduled_at,id limit 1;
   if aid is null then due:=private.crm_qf_business_date(now(),s.business_days);aid:=private.crm_qf_schedule(new,due);end if;
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

create or replace view public.crm_quotation_followup_list with(security_invoker=true) as
 select q.id,q.code,q.customer_name,q.project_name,q.total,q.currency,q.owner_id,q.owner_name,q.status document_status,q.approval_status,q.valid_until,q.created_at,
 f.sent_at,coalesce(f.status,case when q.status='accepted' then 'won' when q.status='rejected' then 'lost' when q.status='cancelled' then 'cancelled' else 'waiting' end) followup_status,
 coalesce(f.last_result,history.description) last_result,coalesce(f.last_at,history.updated_at) last_at,case when f.quotation_id is not null then f.next_at else planned.scheduled_at end next_at,coalesce(f.activity_id,planned.id) activity_id,coalesce(f.revision,0) revision,
 (coalesce(f.status,'waiting') not in ('won','lost','cancelled') and q.status not in ('accepted','rejected','cancelled')) is_open,
 (f.quotation_id is not null) tracked
 from public.quotations q left join public.crm_quotation_followups f on f.quotation_id=q.id
 left join lateral(select a.id,a.scheduled_at from public.activities a where a.related_module='quotations' and a.related_id=q.id and a.type='Proposal Follow-up' and a.status not in ('completed','cancelled') order by a.scheduled_at,a.id limit 1) planned on f.quotation_id is null
 left join lateral(select a.description,a.updated_at from public.activities a where a.related_module='quotations' and a.related_id=q.id and a.type='Proposal Follow-up' and a.status='completed' order by a.updated_at desc,a.id limit 1) history on f.quotation_id is null
 where private.crm_can('quotations','view') and private.crm_qf_owner_visible(q.owner_id);


create index if not exists crm_activity_quotation_followup on public.activities(related_id,scheduled_at) where related_module='quotations' and type='Proposal Follow-up';