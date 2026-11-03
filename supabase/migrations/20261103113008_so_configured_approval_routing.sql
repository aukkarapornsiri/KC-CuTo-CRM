-- Route SO opening and historical revisions through the configured ordered policy.
-- Existing completed decisions are preserved; route snapshots are assigned on submission.
alter table public.crm_so_approvals
 add column approval_policy_id uuid references public.crm_approval_policies(id),
 add column approval_policy_name text,
 add column approver_ids uuid[] not null default '{}',
 add column current_step integer not null default 1,
 add column approval_history jsonb not null default '[]';
alter table public.crm_so_amendments
 add column approval_policy_id uuid references public.crm_approval_policies(id),
 add column approval_policy_name text,
 add column approver_ids uuid[] not null default '{}',
 add column current_step integer not null default 1,
 add column approval_history jsonb not null default '[]';

create or replace function private.crm_so_configured_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders;p public.crm_approval_policies;u uuid:=auth.uid();who uuid;sig text;
begin
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 if not found then raise exception 'Sales order not found';end if;
 if new.status='pending' and (tg_op='INSERT' or old.status<>'pending' or cardinality(old.approver_ids)=0
   or (tg_table_name='crm_so_approvals' and (to_jsonb(new)->>'revision') is distinct from (to_jsonb(old)->>'revision'))) then
  select * into p from public.crm_approval_policies where is_active and minimum_amount<=s.total
   order by minimum_amount desc,id limit 1;
  if not found then raise exception 'No approval policy configured / กรุณาให้ Super Admin ตั้งค่าขั้นตอนอนุมัติ';end if;
  if new.requested_by=any(p.approver_ids) or s.owner_id=any(p.approver_ids) then
   raise insufficient_privilege using message='Requester and SO owner cannot approve their own document / ผู้ขอและเจ้าของ SO อนุมัติเองไม่ได้';
  end if;
  if exists(select 1 from unnest(p.approver_ids) x where not exists(
   select 1 from public.profiles f left join public.role_permissions r
   on r.role_key=case when f.role='custom' then f.custom_role_key else f.role end and r.module='quotations'
   where f.id=x and f.is_active and f.deleted_at is null and (f.is_super_admin or coalesce(r.can_approve,false))
  )) then raise exception 'Configured approvers must be active and have approval permission';end if;
  new.approval_policy_id:=p.id;new.approval_policy_name:=p.name;new.approver_ids:=p.approver_ids;new.current_step:=1;
  new.approval_history:=case when tg_op='INSERT' then '[]'::jsonb else old.approval_history end;
 elsif tg_op='UPDATE' and old.status='pending' then
  new.approval_policy_id:=old.approval_policy_id;new.approval_policy_name:=old.approval_policy_name;
  new.approver_ids:=old.approver_ids;new.current_step:=old.current_step;new.approval_history:=old.approval_history;
  if new.status in ('approved','rejected') then
   who:=old.approver_ids[old.current_step];
   if u is null or who is distinct from u or new.reviewed_by is distinct from u
    or u=new.requested_by or u=s.owner_id or not private.crm_active_user()
    or not private.crm_can('quotations','view') or not private.crm_can('quotations','approve') then
    raise insufficient_privilege using message='Only the configured current approver may review this step';
   end if;
   if tg_table_name='crm_so_approvals' and new.status='approved' then
    select storage_key into sig from public.crm_sales_signature_defaults where user_id=u for share;
    if coalesce(sig,'')='' or not exists(select 1 from storage.objects where bucket_id='crm-quotation-assets' and name=sig) then
     raise exception 'Save your signature in Profile before approving / กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ';
    end if;
   end if;
   new.approval_history:=old.approval_history||jsonb_build_array(jsonb_build_object(
    'step',old.current_step,'actor_id',u,'decision',new.status,'note',new.review_note,
    'at',clock_timestamp(),'revision',to_jsonb(new)->'revision','policy_id',old.approval_policy_id,'signature_storage_key',sig));
   if new.status='approved' and old.current_step<cardinality(old.approver_ids) then
    new.current_step:=old.current_step+1;new.status:='pending';new.reviewed_by:=null;new.reviewed_at:=null;new.review_note:='';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.crm_so_configured_policy() from public,anon,authenticated;
create trigger crm_00_so_policy_route before insert or update on public.crm_so_approvals
 for each row execute function private.crm_so_configured_policy();
create trigger crm_00_so_policy_route before insert or update on public.crm_so_amendments
 for each row execute function private.crm_so_configured_policy();

CREATE OR REPLACE FUNCTION private.crm_so_approval_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.crm_sales_orders; dest uuid; title text; msg text; approver record;
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status and new.current_step=old.current_step and new.revision=old.revision and new.approver_ids=old.approver_ids then return new; end if;
 select * into o from public.crm_sales_orders where id=new.sales_order_id;
 if o.id is null then return new; end if;
 if new.status='pending' then
  title:='SO approval requested • '||o.code;
  msg:='Sales Order '||o.code||' for '||o.customer_name||' requires approval. Open KC CuTo CRM > Sales Orders.';
  update public.notifications set resolved_at=clock_timestamp(),resolution='step_completed'
   where resolved_at is null and event_key like 'so-approval:'||new.sales_order_id||':%';
  for approver in select p.id from public.profiles p where p.id=new.approver_ids[new.current_step] and p.is_active and p.deleted_at is null
  loop
    insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
    values(approver.id,'approval',title,msg,'quotations',o.quotation_id,
      'so-approval:'||new.sales_order_id||':'||new.revision||':pending:step-'||new.current_step||':'||approver.id,
      'approval_requested','high')
    on conflict do nothing;
  end loop;
 else
  update public.notifications set resolved_at=clock_timestamp(),resolution=new.status
   where resolved_at is null and event_key like 'so-approval:'||new.sales_order_id||':%';
  title:=case when new.status='approved' then 'SO approved • ' else 'SO rejected • ' end||o.code;
  msg:='Sales Order '||o.code||' was '||new.status||'. '||coalesce(new.review_note,'');
  for dest in select distinct id from (values(new.requested_by),(o.owner_id),(o.created_by)) t(id)
    where id is not null and id is distinct from new.reviewed_by
  loop
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(dest,'approval',title,msg,'quotations',o.quotation_id,
    'so-approval:'||new.sales_order_id||':'||new.revision||':'||new.status||':'||dest,
    'approval_resolved','high')
   on conflict do nothing;
  end loop;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_so_amendment_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;dest uuid;begin
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 if tg_op='UPDATE' and new.status=old.status and new.current_step=old.current_step and new.approver_ids=old.approver_ids then return null;end if;
 if new.status='pending' then
  update public.notifications set resolved_at=clock_timestamp(),resolution='step_completed'
   where resolved_at is null and event_key like 'so-amendment:'||new.id||':pending:%';
  for dest in select p.id from public.profiles p where p.id=new.approver_ids[new.current_step] and p.is_active and p.deleted_at is null
  loop
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(dest,'approval','ขอแก้ไข SO / Request SO amendment • '||s.code,new.reason,'quotations',s.quotation_id,
    'so-amendment:'||new.id||':pending:step-'||new.current_step||':'||dest,'approval_requested','high') on conflict do nothing;
  end loop;
 else
  update public.notifications set resolved_at=clock_timestamp(),resolution=new.status where resolved_at is null and event_key like 'so-amendment:'||new.id||':pending:%';
  if new.status in ('approved','rejected') then
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(new.requested_by,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
    new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status,'approval_resolved','high') on conflict do nothing;
  end if;
 end if;return null;
end $function$
;
revoke all on function private.crm_so_approval_notify() from public,anon,authenticated;
revoke all on function private.crm_so_amendment_notify() from public,anon,authenticated;
-- Route any in-flight requests; completed decisions and business documents are untouched.
update public.crm_so_approvals set status='pending' where status='pending' and cardinality(approver_ids)=0;
update public.crm_so_amendments set status='pending' where status='pending' and cardinality(approver_ids)=0;
notify pgrst,'reload schema';

