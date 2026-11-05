-- Typed templates route by request_type, never by a user-entered display name.
alter table public.crm_approval_policies drop constraint crm_approval_policies_request_type_check;
alter table public.crm_approval_policies add constraint crm_approval_policies_request_type_check check(request_type in ('quotation','so','amendment','quotation_edit','lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase'));
alter table public.customers add column credit_days integer not null default 0 check(credit_days between 0 and 365);
alter table public.customers add column credit_limit numeric(18,2) not null default 0 check(credit_limit>=0 and credit_limit<1000000000000000);

create function private.crm_template_module(k text) returns text language sql immutable set search_path='' as $$
 select case when k in ('lead_merge','lead_reassignment') then 'leads' when k in ('so_cancellation','special_purchase') then 'quotations' when k='credit_terms' then 'customers' when k in ('contract_amendment','contract_renewal') then 'contracts' when k='inventory_adjustment' then 'inventory' end
$$;
create function private.crm_template_eligible(u uuid,k text,review boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.crm_active_user(u) and exists(select 1 from public.profiles p left join public.role_permissions r on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module=private.crm_template_module(k) where p.id=u and (p.is_super_admin or (coalesce(r.can_view,false) and case when k='inventory_adjustment' then coalesce(r.can_create,false) else coalesce(r.can_edit,false) end and (k<>'lead_reassignment' or coalesce(r.can_assign,false)) and (k<>'contract_renewal' or coalesce(r.can_create,false)) and (not review or case when k in ('lead_merge','lead_reassignment') then coalesce(r.can_assign,false) else coalesce(r.can_approve,false) end))))
$$;
create function private.crm_template_approvers(p_type text) returns table(id uuid,display_name text,email text,role_key text,request_type text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege;end if;
 return query select p.id,p.display_name,p.email,case when p.role='custom' then p.custom_role_key else p.role end,k.kind from public.profiles p cross join unnest(case when p_type is null then array['quotation','so','quotation_edit','amendment','lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase'] else array[p_type] end) k(kind) where case when private.crm_template_module(k.kind) is null then k.kind in ('quotation','so','quotation_edit','amendment') and private.crm_flow_eligible(p.id) else private.crm_template_eligible(p.id,k.kind,true) end order by p.display_name,p.email;
end $$;
create function public.crm_template_approvers(p_type text default null) returns table(id uuid,display_name text,email text,role_key text,request_type text) language sql security invoker set search_path='' as $$ select * from private.crm_template_approvers(p_type) $$;
create or replace function private.crm_policy_validate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 if tg_op='UPDATE' and old.deleted_at is not null then raise exception 'Approval flow has been deleted';end if;
 if new.deleted_at is not null then raise exception 'Use permanent approval policy deletion';end if;
 if new.request_type in ('lead_merge','lead_reassignment','inventory_adjustment') and new.minimum_amount<>0 then raise exception 'This template uses a zero threshold';end if;
 if cardinality(new.approver_ids) not between 1 and 8 or cardinality(new.approver_ids)<>(select count(distinct x) from unnest(new.approver_ids) x) then raise exception 'Select 1–8 distinct approvers in order';end if;
 if exists(select 1 from unnest(new.approver_ids) x where not coalesce(case when private.crm_template_module(new.request_type) is null then private.crm_flow_eligible(x) else private.crm_template_eligible(x,new.request_type,true) end,false)) then raise exception 'Every approver must be active and eligible for this template';end if;
 if tg_op='UPDATE' and new.request_type<>old.request_type then raise exception 'An existing policy cannot change template';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;

create table public.crm_template_requests(
 id uuid primary key default gen_random_uuid(),request_type text not null check(request_type in ('lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase')),
 target_id uuid not null,requested_by uuid not null references public.profiles(id),reason text not null check(length(trim(reason)) between 3 and 2000),
 payload jsonb not null,reference_labels jsonb not null default '{}',before_snapshot jsonb not null,source_snapshot jsonb,amount numeric not null default 0,
 approval_policy_id uuid,approval_policy_name text not null,approver_ids uuid[] not null,current_step integer not null default 1,
 status text not null default 'pending' check(status in ('pending','applying','approved','rejected','cancelled')),
 approval_history jsonb not null default '[]',result jsonb,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create unique index crm_template_one_pending on public.crm_template_requests(request_type,target_id) where status in ('pending','applying');
create index crm_template_requester on public.crm_template_requests(requested_by,created_at desc);
create index crm_template_approvers on public.crm_template_requests using gin(approver_ids);
alter table public.crm_template_requests enable row level security;
create policy crm_template_read on public.crm_template_requests for select to authenticated using(private.crm_active_user() and private.crm_can(private.crm_template_module(request_type),'view') and (requested_by=(select auth.uid()) or (select auth.uid())=any(approver_ids) or private.crm_is_super_admin()));
revoke all on public.crm_template_requests from public,anon,authenticated;
grant select on public.crm_template_requests to authenticated;

create table public.crm_special_purchase_authorizations(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references public.crm_template_requests(id),sales_order_id uuid not null references public.crm_sales_orders(id),
 supplier text not null,items jsonb not null,approved_amount numeric not null,requested_by uuid not null references public.profiles(id),approved_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp()
);
create index crm_special_purchase_so on public.crm_special_purchase_authorizations(sales_order_id);
alter table public.crm_special_purchase_authorizations enable row level security;
create policy crm_purchase_read on public.crm_special_purchase_authorizations for select to authenticated using(exists(select 1 from public.crm_template_requests r where r.id=request_id));
revoke all on public.crm_special_purchase_authorizations from public,anon,authenticated;
grant select on public.crm_special_purchase_authorizations to authenticated;

-- Only the decision transaction can put a request in applying. A client-set GUC alone grants nothing.
create function private.crm_template_applying(k text,target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.crm_template_requests r where r.id=nullif(current_setting('crm.template_request',true),'')::uuid and r.request_type=k and r.target_id=target and r.status='applying' and r.approver_ids[r.current_step]=auth.uid() and r.requested_by<>auth.uid())
$$;
create function private.crm_template_required(k text,target uuid,amount numeric default 0) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.crm_approval_policies where request_type=k and is_active and deleted_at is null and minimum_amount<=amount) and not private.crm_template_applying(k,target) then raise exception 'Approval required: use Approval center > New request > %',k using errcode='42501';end if;
end $$;

create function private.crm_template_validate(k text,target uuid,p jsonb,s jsonb) returns numeric language plpgsql security definer set search_path='' as $$
declare allowed text[];amount numeric:=0;src public.leads;entry jsonb;n numeric;
begin
 if jsonb_typeof(p)<>'object' or length(p::text)>65536 then raise exception 'Invalid request payload';end if;
 allowed:=case k when 'lead_merge' then array['source_id','incoming'] when 'lead_reassignment' then array['owner_id'] when 'so_cancellation' then '{}'::text[] when 'credit_terms' then array['credit_days','credit_limit'] when 'contract_amendment' then array['name','product','value','start_date','end_date','sla_level'] when 'contract_renewal' then array['end_date','value'] when 'inventory_adjustment' then array['warehouse_id','serial_number','quantity'] when 'special_purchase' then array['supplier','items'] end;
 if exists(select 1 from jsonb_each(p) e where e.value='null'::jsonb and e.key not in ('source_id')) then raise exception 'Request fields cannot be null';end if;
 if allowed is null or exists(select 1 from jsonb_object_keys(p) x where not x=any(allowed)) then raise exception 'Unsupported template or field';end if;
 if k='lead_merge' then
  if nullif(p->>'source_id','') is not null then select * into src from public.leads where id=(p->>'source_id')::uuid for update;
  else
   if jsonb_typeof(p->'incoming')<>'object' or length((p->'incoming')::text)>32768 then raise exception 'Incoming lead draft required';end if;
   select * into src from jsonb_populate_record(null::public.leads,p->'incoming');
   if src.owner_id is distinct from auth.uid() and not private.crm_lead_assigner_eligible(auth.uid()) then raise insufficient_privilege;end if;
  end if;
  if (nullif(p->>'source_id','') is not null and src.id is null) or src.id=target or not coalesce(private.crm_lead_company_duplicate(to_jsonb(src),s),false) or (src.customer_id is not null and nullif(s->>'customer_id','') is not null and src.customer_id<>(s->>'customer_id')::uuid) then raise exception 'Select distinct duplicate leads with compatible customer accounts';end if;
  if src.owner_id is not distinct from nullif(s->>'owner_id','')::uuid then raise exception 'Same-owner leads use the existing immediate merge action';end if;
  if exists(select 1 from public.crm_lead_resolutions where action='merge' and (source_id in (target,src.id) or target_id=src.id)) then raise exception 'Lead already merged; review primary record';end if;
 elsif k='lead_reassignment' then
  if not coalesce(private.crm_assignment_eligible((p->>'owner_id')::uuid,'leads'),false) or p->>'owner_id'=s->>'owner_id' then raise exception 'Select a different active eligible lead owner';end if;
 elsif k='so_cancellation' then
  if s->>'status'<>'confirmed' then raise exception 'Only confirmed SO can be cancelled';end if;amount:=(s->>'total')::numeric;
 elsif k='credit_terms' then
  if not (p ?& array['credit_days','credit_limit']) or (p->>'credit_days')::numeric<>trunc((p->>'credit_days')::numeric) or (p->>'credit_days')::integer not between 0 and 365 or (p->>'credit_limit')::numeric<0 or not((p->>'credit_limit')::numeric<1e15) then raise exception 'Credit days must be 0–365 and limit must be nonnegative';end if;amount:=(p->>'credit_limit')::numeric;
 elsif k in ('contract_amendment','contract_renewal') then
  if s->>'status' in ('cancelled','lost','renewed') or p='{}'::jsonb then raise exception 'Contract cannot be changed in this state';end if;
  if k='contract_renewal' and (not(p ?& array['end_date','value']) or (p->>'end_date')::date<= (s->>'end_date')::date) then raise exception 'Renewal must end after the current contract';end if;
  amount:=coalesce((p->>'value')::numeric,(s->>'value')::numeric,0);
  if amount<0 or not(amount<1e15) or coalesce((p->>'end_date')::date,(s->>'end_date')::date)<coalesce((p->>'start_date')::date,(s->>'start_date')::date) then raise exception 'Invalid contract value or dates';end if;
  if p?'name' and length(trim(p->>'name')) not between 1 and 200 then raise exception 'Contract name required';end if;
 elsif k='inventory_adjustment' then
  n:=(p->>'quantity')::numeric;
  if n is null or n=0 or not(abs(n)<1e9) or not exists(select 1 from public.crm_warehouses where id=(p->>'warehouse_id')::uuid and active) or not exists(select 1 from public.crm_item_details where id=target and stock_mode='stock' and (not track_serial or (abs(n)=1 and length(trim(p->>'serial_number'))>0))) then raise exception 'Select an active warehouse, stock item and nonzero quantity delta';end if;
 elsif k='special_purchase' then
  if s->>'status'='cancelled' or length(trim(coalesce(p->>'supplier',''))) not between 1 and 200 or jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 100 then raise exception 'Supplier and 1–100 purchase lines required';end if;
  for entry in select * from jsonb_array_elements(p->'items') loop
   if length(trim(coalesce(entry->>'name',''))) not between 1 and 300 or (entry->>'qty')::numeric is null or not((entry->>'qty')::numeric>0 and (entry->>'qty')::numeric<1e9) or (entry->>'unit_cost')::numeric is null or not((entry->>'unit_cost')::numeric>=0 and (entry->>'unit_cost')::numeric<1e12) then raise exception 'Invalid purchase item';end if;
   amount:=amount+round((entry->>'qty')::numeric*(entry->>'unit_cost')::numeric,2);
  end loop;
 end if;
 if amount is null or amount<0 or not(amount<1e15) then raise exception 'Invalid approval amount';end if;
 return amount;
end $$;

create function private.crm_template_submit(k text,target uuid,p jsonb,reason text,expected timestamptz,snapshot jsonb) returns public.crm_template_requests language plpgsql security definer set search_path='' as $$
declare s jsonb;src jsonb;amount numeric;policy public.crm_approval_policies;reviewers uuid[];r public.crm_template_requests;tbl text;
begin
 if auth.uid() is null or not private.crm_template_eligible(auth.uid(),k,false) then raise insufficient_privilege;end if;
 if length(trim(coalesce(reason,''))) not between 3 and 2000 then raise exception 'Reason must contain 3–2000 characters';end if;
 if k='lead_merge' then perform pg_advisory_xact_lock(867820);end if;
 tbl:=case when k in ('lead_merge','lead_reassignment') then 'leads' when k in ('so_cancellation','special_purchase') then 'crm_sales_orders' when k='credit_terms' then 'customers' when k in ('contract_amendment','contract_renewal') then 'contracts' when k='inventory_adjustment' then 'crm_price_items' end;
 if tbl is null then raise exception 'Unknown template';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tbl) into s using target;
 if s is null or s is distinct from snapshot or expected is distinct from (s->>'updated_at')::timestamptz then raise exception 'Record changed or inaccessible; reload before requesting';end if;
 amount:=private.crm_template_validate(k,target,p,s);
 if k='lead_merge' then if nullif(p->>'source_id','') is null then src:=p->'incoming';else select to_jsonb(l) into src from public.leads l where id=(p->>'source_id')::uuid;end if;end if;
 if k='inventory_adjustment' then perform 1 from public.crm_inventory_settings where id for update;select jsonb_build_object('quantity',coalesce((select quantity from public.crm_stock_balances where warehouse_id=(p->>'warehouse_id')::uuid and item_id=target and serial_number=coalesce(p->>'serial_number','') for update),0)) into src;end if;
 select * into policy from public.crm_approval_policies where request_type=k and is_active and deleted_at is null and minimum_amount<=amount order by minimum_amount desc limit 1;
 if not found and k='lead_merge' then
  select id,name,approver_ids into policy.id,policy.name,policy.approver_ids from public.crm_lead_duplicate_policies where template_key='cross_owner_merge' and is_active and cardinality(approver_ids)>0 limit 1;
 end if;
 if policy.id is null then raise exception 'No active policy matches this template and amount; ask a Super Admin to configure its approvers';end if;
 -- Never silently remove an owner/requester from a configured sequence.
 reviewers:=policy.approver_ids;
 if auth.uid()=any(reviewers) or nullif(s->>'owner_id','')::uuid=any(reviewers) or (k='lead_merge' and nullif(src->>'owner_id','')::uuid=any(reviewers)) then raise exception 'Configure independent approvers: requester and record owners cannot approve';end if;
 if exists(select 1 from unnest(reviewers) x where not private.crm_template_eligible(x,k,true)) then raise exception 'Configured approver no longer has the required permissions';end if;
 insert into public.crm_template_requests(request_type,target_id,requested_by,reason,payload,before_snapshot,source_snapshot,amount,approval_policy_id,approval_policy_name,approver_ids)
 values(k,target,auth.uid(),trim(reason),p,s,src,amount,policy.id,policy.name,reviewers) returning * into r;
 perform private.crm_notify_once(reviewers[1],private.crm_template_module(k),target,'approval','template:'||r.id||':1','ขออนุมัติ / Approval: '||policy.name,reason,false);
 update public.crm_template_requests set reference_labels=jsonb_build_object('owner_id',(select display_name from public.profiles where id=nullif(p->>'owner_id','')::uuid),'source_id',coalesce(src->>'company_name',src->>'contact_name'),'warehouse_id',(select concat_ws(' · ',code,name) from public.crm_warehouses where id=nullif(p->>'warehouse_id','')::uuid)) where id=r.id returning * into r;
 return r;
end $$;

-- Invoker lookup enforces the source table's RLS before entering the private writer.
create function public.crm_template_submit(p_type text,p_target uuid,p_payload jsonb,p_reason text,p_expected_updated_at timestamptz) returns public.crm_template_requests language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 if p_type in ('lead_merge','lead_reassignment') then
  select to_jsonb(t) into s from public.leads t where id=p_target;
  if p_type='lead_merge' and nullif(p_payload->>'source_id','') is not null and not exists(select 1 from public.leads where id=(p_payload->>'source_id')::uuid) then raise insufficient_privilege;end if;
 elsif p_type in ('so_cancellation','special_purchase') then select to_jsonb(t) into s from public.crm_sales_orders t where id=p_target;
 elsif p_type='credit_terms' then select to_jsonb(t) into s from public.customers t where id=p_target;
 elsif p_type in ('contract_amendment','contract_renewal') then select to_jsonb(t) into s from public.contracts t where id=p_target;
 elsif p_type='inventory_adjustment' then select to_jsonb(t) into s from public.crm_price_items t where id=p_target;
 else raise exception 'Unknown template';end if;
 if s is null then raise insufficient_privilege using message='Record not found or access denied';end if;
 return private.crm_template_submit(p_type,p_target,p_payload,p_reason,p_expected_updated_at,s);
end $$;

create function private.crm_template_decide(p_id uuid,p_action text,p_note text,p_expected timestamptz) returns public.crm_template_requests language plpgsql security definer set search_path='' as $$
declare r public.crm_template_requests;s jsonb;src jsonb;tbl text;outcome jsonb;resid uuid;v public.contracts;old_context text;
begin
 if auth.uid() is null or not private.crm_active_user() then raise insufficient_privilege;end if;
 select * into r from public.crm_template_requests where id=p_id for update;
 if r.id is null or not(auth.uid()=r.requested_by or auth.uid()=any(r.approver_ids)) then raise insufficient_privilege;end if;
 if r.updated_at is distinct from p_expected or r.status<>'pending' then raise exception 'Request changed; reload before deciding';end if;
 if length(coalesce(p_note,''))>2000 or p_action not in ('approve','reject','cancel') then raise exception 'Invalid decision';end if;
 if p_action='cancel' then
  if r.requested_by<>auth.uid() then raise insufficient_privilege;end if;
 else
  if r.requested_by=auth.uid() or r.approver_ids[r.current_step]<>auth.uid() or not private.crm_template_eligible(auth.uid(),r.request_type,true) then raise insufficient_privilege;end if;
  if p_action='reject' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required';end if;
 end if;
 if p_action='approve' then
  if not private.crm_template_eligible(r.requested_by,r.request_type,false) then raise exception 'Requester no longer has permission';end if;
  if r.request_type='lead_merge' then perform pg_advisory_xact_lock(867820);end if;
  tbl:=case when r.request_type in ('lead_merge','lead_reassignment') then 'leads' when r.request_type in ('so_cancellation','special_purchase') then 'crm_sales_orders' when r.request_type='credit_terms' then 'customers' when r.request_type in ('contract_amendment','contract_renewal') then 'contracts' else 'crm_price_items' end;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tbl) into s using r.target_id;
  if s is distinct from r.before_snapshot then raise exception 'Source record changed; withdraw and submit a new request';end if;
  perform private.crm_template_validate(r.request_type,r.target_id,r.payload,s);
  if r.request_type='lead_merge' and nullif(r.payload->>'source_id','') is not null then select to_jsonb(l) into src from public.leads l where id=(r.payload->>'source_id')::uuid for update;if src is distinct from r.source_snapshot then raise exception 'Source lead changed; request again';end if;end if;
  if r.request_type='inventory_adjustment' then
   perform 1 from public.crm_inventory_settings where id for update;
   select jsonb_build_object('quantity',coalesce((select quantity from public.crm_stock_balances where warehouse_id=(r.payload->>'warehouse_id')::uuid and item_id=r.target_id and serial_number=coalesce(r.payload->>'serial_number','') for update),0)) into src;
   if src is distinct from r.source_snapshot then raise exception 'Stock changed; submit a new adjustment request';end if;
  end if;
 end if;
 r.approval_history:=r.approval_history||jsonb_build_array(jsonb_build_object('actor_id',auth.uid(),'action',p_action,'step',r.current_step,'note',p_note,'at',clock_timestamp()));
 update public.notifications set resolved_at=clock_timestamp(),resolution=p_action where event_key='template:'||r.id||':'||r.current_step;
 if p_action='approve' and r.current_step<cardinality(r.approver_ids) then
  r.current_step:=r.current_step+1;
  if not private.crm_template_eligible(r.approver_ids[r.current_step],r.request_type,true) then raise exception 'Next approver no longer eligible';end if;
  perform private.crm_notify_once(r.approver_ids[r.current_step],private.crm_template_module(r.request_type),r.target_id,'approval','template:'||r.id||':'||r.current_step,'ขออนุมัติ / Approval: '||r.approval_policy_name,r.reason,false);
 elsif p_action='approve' then
  update public.crm_template_requests set status='applying' where id=r.id;
  old_context:=current_setting('crm.template_request',true);perform set_config('crm.template_request',r.id::text,true);
  if r.request_type='lead_merge' then
   insert into public.crm_lead_resolutions(request_id,actor_id,target_id,source_id,action,reason,incoming,source_snapshot,reviewer_id,merge_status,merge_owner_id,merge_target_owner_id,resolved_at,reviewed_by,reviewed_at)
   values(r.id,r.requested_by,r.target_id,nullif(r.payload->>'source_id','')::uuid,'merge',r.reason,r.source_snapshot,r.source_snapshot,auth.uid(),'approved',(r.source_snapshot->>'owner_id')::uuid,(s->>'owner_id')::uuid,clock_timestamp(),auth.uid(),clock_timestamp()) returning id into resid;outcome:=jsonb_build_object('resolution_id',resid);
  elsif r.request_type='lead_reassignment' then
   update public.leads set owner_id=(r.payload->>'owner_id')::uuid,owner_name=(select display_name from public.profiles where id=(r.payload->>'owner_id')::uuid),updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(leads) into outcome;
  elsif r.request_type='so_cancellation' then select to_jsonb(public.crm_transition_sales_order(r.target_id,'cancelled',r.reason,(s->>'updated_at')::timestamptz)) into outcome;
  elsif r.request_type='credit_terms' then update public.customers set credit_days=(r.payload->>'credit_days')::integer,credit_limit=(r.payload->>'credit_limit')::numeric,updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(customers) into outcome;
  elsif r.request_type='contract_amendment' then
   select * into v from jsonb_populate_record(null::public.contracts,s||r.payload);
   update public.contracts set name=v.name,product=v.product,value=v.value,start_date=v.start_date,end_date=v.end_date,sla_level=v.sla_level,updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(contracts) into outcome;
  elsif r.request_type='contract_renewal' then select to_jsonb(public.crm_renew_contract(r.target_id,(r.payload->>'end_date')::date,(r.payload->>'value')::numeric)) into outcome;
  elsif r.request_type='inventory_adjustment' then resid:=public.crm_inventory_post(jsonb_build_object('id',r.id,'kind','adjustment','item_id',r.target_id,'warehouse_id',r.payload->>'warehouse_id','serial_number',coalesce(r.payload->>'serial_number',''),'quantity',r.payload->'quantity','reason',r.reason));outcome:=jsonb_build_object('movement_id',resid);
  elsif r.request_type='special_purchase' then
   insert into public.crm_special_purchase_authorizations(request_id,sales_order_id,supplier,items,approved_amount,requested_by,approved_by) values(r.id,r.target_id,r.payload->>'supplier',r.payload->'items',r.amount,r.requested_by,auth.uid()) returning to_jsonb(crm_special_purchase_authorizations) into outcome;
  end if;
  perform set_config('crm.template_request',coalesce(old_context,''),true);r.status:='approved';r.result:=outcome;
 elsif p_action='reject' then r.status:='rejected';else r.status:='cancelled';end if;
 update public.crm_template_requests set status=r.status,current_step=r.current_step,approval_history=r.approval_history,result=r.result,updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'update',private.crm_template_module(r.request_type),r.target_id,jsonb_build_object('template_request',r.id,'template',r.request_type,'decision',p_action,'before',r.before_snapshot,'payload',r.payload,'result',r.result));
 if r.status<>'pending' then perform private.crm_notify_once(r.requested_by,private.crm_template_module(r.request_type),r.target_id,'workflow_result','template-result:'||r.id,r.approval_policy_name||' · '||r.status,r.reason,false);end if;
 return r;
end $$;
create function public.crm_template_decide(p_id uuid,p_action text,p_note text,p_expected_updated_at timestamptz) returns public.crm_template_requests language sql security invoker set search_path='' as $$select private.crm_template_decide(p_id,p_action,p_note,p_expected_updated_at)$$;

-- Gate existing write paths only when a matching policy is enabled.
create function private.crm_template_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='leads' then if new.owner_id is distinct from old.owner_id then perform private.crm_template_required('lead_reassignment',old.id,0);end if;
 elsif tg_table_name='customers' then if (new.credit_days,new.credit_limit) is distinct from (old.credit_days,old.credit_limit) then perform private.crm_template_required('credit_terms',old.id,new.credit_limit);end if;
 elsif tg_table_name='crm_sales_orders' then if new.status='cancelled' and old.status<>'cancelled' then perform private.crm_template_required('so_cancellation',old.id,old.total);end if;
 elsif tg_table_name='contracts' then
  if tg_op='INSERT' and new.renewed_from_id is not null then perform private.crm_template_required('contract_renewal',new.renewed_from_id,new.value);
  elsif tg_op='UPDATE' and (new.name,new.product,new.value,new.start_date,new.end_date,new.sla_level) is distinct from (old.name,old.product,old.value,old.start_date,old.end_date,old.sla_level) then perform private.crm_template_required('contract_amendment',old.id,new.value);end if;
 elsif tg_table_name='crm_stock_movements' then if new.kind='adjustment' then perform private.crm_template_required('inventory_adjustment',new.item_id,0);end if;

 end if;return new;
end $$;
create trigger crm_template_lead_guard before update on public.leads for each row execute function private.crm_template_write_guard();
create trigger crm_template_credit_guard before update on public.customers for each row execute function private.crm_template_write_guard();
create trigger crm_template_cancel_guard before update on public.crm_sales_orders for each row execute function private.crm_template_write_guard();
create trigger crm_template_contract_guard before insert or update on public.contracts for each row execute function private.crm_template_write_guard();
create trigger crm_template_inventory_guard before insert on public.crm_stock_movements for each row execute function private.crm_template_write_guard();

revoke all on function private.crm_template_module(text),private.crm_template_eligible(uuid,text,boolean),private.crm_template_approvers(text),private.crm_template_applying(text,uuid),private.crm_template_required(text,uuid,numeric),private.crm_template_validate(text,uuid,jsonb,jsonb),private.crm_template_submit(text,uuid,jsonb,text,timestamptz,jsonb),private.crm_template_decide(uuid,text,text,timestamptz),private.crm_template_write_guard() from public,anon,authenticated;
-- Only entry points used by invoker wrappers/RLS are callable by authenticated users.
grant execute on function private.crm_template_module(text),private.crm_template_eligible(uuid,text,boolean),private.crm_template_approvers(text),private.crm_template_submit(text,uuid,jsonb,text,timestamptz,jsonb),private.crm_template_decide(uuid,text,text,timestamptz) to authenticated;
revoke all on function public.crm_template_approvers(text),public.crm_template_submit(text,uuid,jsonb,text,timestamptz),public.crm_template_decide(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.crm_template_approvers(text),public.crm_template_submit(text,uuid,jsonb,text,timestamptz),public.crm_template_decide(uuid,text,text,timestamptz) to authenticated;

create function private.crm_template_has_policy(p_type text,p_amount numeric) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_template_eligible(auth.uid(),p_type,false) then return false;end if;
 return exists(select 1 from public.crm_approval_policies where request_type=p_type and is_active and deleted_at is null and minimum_amount<=p_amount);
end $$;
create function public.crm_template_has_policy(p_type text,p_amount numeric default 0) returns boolean language sql security invoker set search_path='' as $$select private.crm_template_has_policy(p_type,p_amount)$$;
revoke all on function private.crm_template_has_policy(text,numeric),public.crm_template_has_policy(text,numeric) from public,anon;
grant execute on function private.crm_template_has_policy(text,numeric),public.crm_template_has_policy(text,numeric) to authenticated;

-- Lead merge already has a dedicated policy editor. Both editors must share one route.
alter table public.crm_approval_policies add column lead_policy_id uuid unique references public.crm_lead_duplicate_policies(id) on delete cascade;
create unique index crm_template_one_lead_merge_policy on public.crm_approval_policies(request_type) where request_type='lead_merge';
create function private.crm_template_lead_policy_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare native public.crm_lead_duplicate_policies;value jsonb;
begin
 if pg_trigger_depth()>1 then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op='DELETE' then
  if old.request_type='lead_merge' and old.lead_policy_id is not null then
   select * into native from public.crm_lead_duplicate_policies where id=old.lead_policy_id;
   if found then perform private.crm_lead_policy_change('delete',native.id,native.version,'{}');end if;
  end if;return old;
 end if;
 if new.request_type<>'lead_merge' then if new.lead_policy_id is not null then raise exception 'Only Lead Merge can link a lead policy';end if;return new;end if;
 if tg_op='UPDATE' then new.lead_policy_id:=old.lead_policy_id;else new.lead_policy_id:=null;end if;
 perform pg_advisory_xact_lock(867820);
 if new.lead_policy_id is not null then select * into native from public.crm_lead_duplicate_policies where id=new.lead_policy_id for update;
 else select * into native from public.crm_lead_duplicate_policies where template_key='cross_owner_merge' order by is_active desc,updated_at desc limit 1 for update;end if;
 value:=private.crm_lead_policy_change('save',native.id,native.version,jsonb_build_object('template_key','cross_owner_merge','name',new.name,'details',coalesce(native.details,'Approval template: lead_merge'),'approver_ids',to_jsonb(new.approver_ids),'is_active',new.is_active));
 new.lead_policy_id:=(value->>'id')::uuid;return new;
end $$;
create trigger crm_template_lead_policy_sync before insert or update on public.crm_approval_policies for each row execute function private.crm_template_lead_policy_sync();
create trigger crm_template_lead_policy_delete after delete on public.crm_approval_policies for each row execute function private.crm_template_lead_policy_sync();
create function private.crm_template_native_lead_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>1 then return new;end if;
 if exists(select 1 from public.crm_approval_policies where lead_policy_id=new.id) then
  if new.template_key<>'cross_owner_merge' then raise exception 'A linked Lead Merge policy cannot change template';end if;
  update public.crm_approval_policies set name=new.name,approver_ids=new.approver_ids,is_active=new.is_active,updated_at=clock_timestamp() where lead_policy_id=new.id;
 end if;return new;
end $$;
create trigger crm_template_native_lead_sync after insert or update on public.crm_lead_duplicate_policies for each row execute function private.crm_template_native_lead_sync();
revoke all on function private.crm_template_lead_policy_sync(),private.crm_template_native_lead_sync() from public,anon,authenticated;
