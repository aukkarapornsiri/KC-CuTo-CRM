create table public.crm_document_edit_settings (
 id boolean primary key default true check(id),
 quotation_requires_approval boolean not null default true,
 so_requires_approval boolean not null default true,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
insert into public.crm_document_edit_settings(id) values(true);
alter table public.crm_document_edit_settings enable row level security;
revoke all on public.crm_document_edit_settings from public,anon,authenticated;
create function private.crm_edit_approval_required(kind text) returns boolean language sql stable security definer set search_path='' as $$
 select case kind when 'quotation' then quotation_requires_approval else so_requires_approval end from public.crm_document_edit_settings where id;
$$;
revoke all on function private.crm_edit_approval_required(text) from public,anon;
grant execute on function private.crm_edit_approval_required(text) to authenticated;
create function private.crm_document_edit_policy(p_patch jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.crm_document_edit_settings;before_row jsonb;begin
 if auth.uid() is null or not private.crm_active_user() then raise insufficient_privilege;end if;
 if p_patch is not null then
  if not exists(select 1 from public.profiles where id=auth.uid() and is_super_admin and is_active and deleted_at is null) then raise insufficient_privilege;end if;
  if jsonb_typeof(p_patch->'quotation_requires_approval') is distinct from 'boolean' or jsonb_typeof(p_patch->'so_requires_approval') is distinct from 'boolean' then raise exception 'Both approval conditions must be boolean';end if;
  select to_jsonb(x) into before_row from public.crm_document_edit_settings x where id for update;
  if p_patch->>'expected_updated_at' is null or (p_patch->>'expected_updated_at')::timestamptz is distinct from (before_row->>'updated_at')::timestamptz then raise exception 'Settings changed. Reload first' using errcode='40001';end if;
  update public.crm_document_edit_settings set quotation_requires_approval=(p_patch->>'quotation_requires_approval')::boolean,so_requires_approval=(p_patch->>'so_requires_approval')::boolean,updated_at=clock_timestamp(),updated_by=auth.uid() where id;
  insert into public.audit_logs(user_id,action,module,changes) values(auth.uid(),'update','settings',jsonb_build_object('document_edit_conditions',p_patch,'before',before_row));
 end if;
 select * into s from public.crm_document_edit_settings where id;return to_jsonb(s);
end $$;
create function public.crm_document_edit_policy(p_patch jsonb default null) returns jsonb language sql set search_path='' as $$select private.crm_document_edit_policy(p_patch)$$;
revoke all on function private.crm_document_edit_policy(jsonb),public.crm_document_edit_policy(jsonb) from public,anon;
grant execute on function private.crm_document_edit_policy(jsonb),public.crm_document_edit_policy(jsonb) to authenticated;

alter table public.crm_approval_policies drop constraint crm_approval_policies_request_type_check;
alter table public.crm_approval_policies add constraint crm_approval_policies_request_type_check check(request_type in ('quotation','so','amendment','quotation_edit'));
-- Give existing installations a usable quotation edit flow; administrators can customize it separately.
do $seed$ declare actor uuid;previous_claim text:=current_setting('request.jwt.claim.sub',true);begin
 select id into actor from public.profiles where is_super_admin and is_active and deleted_at is null order by id limit 1;
 if actor is not null then
  perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.crm_approval_policies(name,minimum_amount,approver_ids,is_active,request_type)
 select left('Edit Approved Quotation · '||name,200),minimum_amount,approver_ids,is_active,'quotation_edit' from public.crm_approval_policies where request_type='quotation' and deleted_at is null and is_active;
  perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
 end if;
end $seed$;

create table public.crm_quotation_edit_requests (
 id uuid primary key default gen_random_uuid(),quotation_id uuid not null references public.quotations(id),
 requested_by uuid not null references public.profiles(id),reason text not null check(length(reason) between 3 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','applied')),
 base_updated_at timestamptz not null,before_snapshot jsonb not null,
 approver_ids uuid[] not null,current_step integer not null default 1,
 approval_history jsonb not null default '[]',reviewed_by uuid references public.profiles(id),review_note text not null default '',
 requested_at timestamptz not null default now(),applied_at timestamptz
);
create unique index crm_quote_one_open_edit on public.crm_quotation_edit_requests(quotation_id) where status in ('pending','approved');
alter table public.crm_quotation_edit_requests enable row level security;
revoke all on public.crm_quotation_edit_requests from public,anon,authenticated;
grant select on public.crm_quotation_edit_requests to authenticated;
create policy quotation_edit_read on public.crm_quotation_edit_requests for select to authenticated using(private.crm_active_user() and private.crm_can('quotations','view') and (requested_by=auth.uid() or auth.uid()=any(approver_ids) or exists(select 1 from public.profiles where id=auth.uid() and is_super_admin)));

create function private.crm_quotation_edit_action(p_quotation_id uuid,p_action text,p_reason text default '',p_request_id uuid default null,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quotations;a public.crm_quotation_edit_requests;p public.crm_approval_policies;dest uuid;u uuid:=auth.uid();begin
 if u is null or not private.crm_active_user() or not private.crm_can('quotations','view') then raise insufficient_privilege;end if;
 select * into q from public.quotations where id=p_quotation_id for update;if not found then raise exception 'Quotation not found';end if;
 if p_action='request' then
  if not private.crm_can('quotations','edit') then raise insufficient_privilege;end if;
  if q.approval_status is distinct from 'approved' then raise exception 'Only approved quotations can be amended';end if;
  if q.updated_at is distinct from p_expected_updated_at then raise exception 'Quotation changed. Reload first';end if;
  if exists(select 1 from public.crm_sales_orders where quotation_id=q.id) then raise exception 'This quotation already has an SO. Edit the SO instead';end if;
  select * into a from public.crm_quotation_edit_requests where quotation_id=q.id and status in ('pending','approved');
  if found then if a.requested_by=u then return to_jsonb(a);else raise exception 'An edit request is already open';end if;end if;
  if length(btrim(p_reason)) not between 3 and 2000 then raise exception 'Enter a reason (3–2000 characters)';end if;
  select * into p from public.crm_approval_policies where request_type='quotation_edit' and is_active and deleted_at is null and minimum_amount<=q.total order by minimum_amount desc,id limit 1;
  if not found then raise exception 'Configure Edit Approved Quotation approval flow first';end if;
  if u=any(p.approver_ids) or q.owner_id=any(p.approver_ids) then raise insufficient_privilege using message='Requester and owner cannot approve their own edit';end if;
  if exists(select 1 from unnest(p.approver_ids) x where not exists(select 1 from public.profiles f where f.id=x and f.is_active and f.deleted_at is null and (f.is_super_admin or exists(select 1 from public.role_permissions r where r.role_key=case when f.role='custom' then f.custom_role_key else f.role end and r.module='quotations' and r.can_view and r.can_approve)))) then raise exception 'Configured approver is unavailable';end if;
  insert into public.crm_quotation_edit_requests(quotation_id,requested_by,reason,base_updated_at,before_snapshot,approver_ids) values(q.id,u,btrim(p_reason),q.updated_at,to_jsonb(q),p.approver_ids) returning * into a;
 elsif p_action in ('approve','reject','cancel') then
  select * into a from public.crm_quotation_edit_requests where id=p_request_id and quotation_id=q.id for update;
  if not found then raise exception 'Edit request not found';end if;
  if p_action='cancel' then
   if a.requested_by<>u or a.status not in ('pending','approved') then raise insufficient_privilege;end if;
   update public.crm_quotation_edit_requests set status='cancelled' where id=a.id returning * into a;
  else
   if a.status<>'pending' or a.approver_ids[a.current_step] is distinct from u or a.requested_by=u or q.owner_id=u or not private.crm_can('quotations','approve') then raise insufficient_privilege using message='Only the configured current approver may review';end if;
   if q.approval_status is distinct from 'approved' or q.updated_at is distinct from a.base_updated_at then raise exception 'Quotation changed. Withdraw and request again';end if;
   if p_action='reject' and length(btrim(p_reason))<3 then raise exception 'Rejection reason required';end if;
   update public.crm_quotation_edit_requests set approval_history=approval_history||jsonb_build_array(jsonb_build_object('actor_id',u,'decision',p_action,'step',current_step,'at',clock_timestamp(),'note',p_reason)),status=case when p_action='reject' then 'rejected' when current_step=cardinality(approver_ids) then 'approved' else 'pending' end,current_step=case when p_action='approve' and current_step<cardinality(approver_ids) then current_step+1 else current_step end,reviewed_by=u,review_note=left(p_reason,2000) where id=a.id returning * into a;
  end if;
 else raise exception 'Invalid edit action';end if;
 update public.notifications set resolved_at=clock_timestamp(),resolution=a.status where event_key like 'quotation-edit:'||a.id||':%' and resolved_at is null;
 dest:=case when a.status='pending' then a.approver_ids[a.current_step] else a.requested_by end;
 insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority) values(dest,'approval','Edit Approved Quotation · '||q.code,a.reason,'quotations',q.id,'quotation-edit:'||a.id||':'||a.status||':'||a.current_step,case when a.status='pending' then 'approval_requested' else 'approval_resolved' end,'high') on conflict do nothing;
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(u,'update','quotations',q.id,jsonb_build_object('edit_request',a.id,'decision',p_action));return to_jsonb(a);
end $$;
create function public.crm_quotation_edit_action(p_quotation_id uuid,p_action text,p_reason text default '',p_request_id uuid default null,p_expected_updated_at timestamptz default null) returns jsonb language sql set search_path='' as $$select private.crm_quotation_edit_action(p_quotation_id,p_action,p_reason,p_request_id,p_expected_updated_at)$$;
revoke all on function private.crm_quotation_edit_action(uuid,text,text,uuid,timestamptz),public.crm_quotation_edit_action(uuid,text,text,uuid,timestamptz) from public,anon;
grant execute on function private.crm_quotation_edit_action(uuid,text,text,uuid,timestamptz),public.crm_quotation_edit_action(uuid,text,text,uuid,timestamptz) to authenticated;

alter table public.crm_so_amendments add column approval_bypassed boolean not null default false;
CREATE OR REPLACE FUNCTION private.crm_quote_approval_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare edit_request public.crm_quotation_edit_requests;
BEGIN
 IF coalesce(current_setting('crm.approval_transition',true),'')='yes' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' and OLD.approval_status='approved'
 and (to_jsonb(NEW)-ARRAY['updated_at','status','approval_status','approval_comment']) is distinct from (to_jsonb(OLD)-ARRAY['updated_at','status','approval_status','approval_comment']) THEN
  if auth.uid() is null or not private.crm_active_user() or not private.crm_can('quotations','view') or not private.crm_can('quotations','edit') then raise insufficient_privilege;end if;
  perform 1 from public.crm_document_edit_settings where id for share;
  if exists(select 1 from public.crm_sales_orders where quotation_id=old.id) then raise exception 'This quotation already has an SO. Edit the SO instead';end if;
  if private.crm_edit_approval_required('quotation') then
   select * into edit_request from public.crm_quotation_edit_requests where quotation_id=old.id and status='approved' and requested_by=auth.uid() and base_updated_at=old.updated_at for update;
   if not found then raise insufficient_privilege using message='Edit Approved Quotation approval required';end if;
  end if;
  update public.crm_quotation_edit_requests set status='applied',applied_at=clock_timestamp() where quotation_id=old.id and status in ('pending','approved') and (requested_by=auth.uid() or not private.crm_edit_approval_required('quotation'));
  update public.notifications set resolved_at=clock_timestamp(),resolution='revised' where related_module='quotations' and related_id=old.id and event_key like 'quotation-edit:%' and resolved_at is null;
  NEW.approval_status:=null;NEW.approval_comment:=null;NEW.status:='draft';
  insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'update','quotations',old.id,jsonb_build_object('approved_quotation_edit',true,'before',to_jsonb(old)));
  return NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  IF coalesce(NEW.approval_status,'')<>'' THEN RAISE EXCEPTION 'Save a draft, then submit through the approval workflow'; END IF;
 ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN RAISE EXCEPTION 'Use the approval workflow';
 ELSIF OLD.approval_status IN ('pending','approved') AND (to_jsonb(NEW)-ARRAY['updated_at','status','approval_comment']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','approval_comment']) THEN RAISE EXCEPTION 'Withdraw pending approval or create a new draft before editing';
 END IF;
 IF NEW.status IN ('approved','accepted','sent') AND coalesce(NEW.approval_status,'')<>'approved' THEN RAISE EXCEPTION 'Approval required'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.crm_so_amendment_action(p_sales_order_id uuid, p_action text, p_note text, p_expected_updated_at timestamp with time zone, p_request_id uuid)
 RETURNS crm_so_amendments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;a public.crm_so_amendments;u uuid:=auth.uid();begin
 if u is null or not private.crm_active_user() or not private.crm_can('quotations','view') then raise insufficient_privilege using message='SO access denied';end if;
 select * into s from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found';end if;
 if p_action='request' then
  perform 1 from public.crm_document_edit_settings where id for share;
  if not private.crm_can('quotations','edit') or u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can request an SO amendment';end if;
  if s.status='cancelled' then raise exception 'Cancelled SO cannot be amended';end if;
  if s.updated_at is distinct from p_expected_updated_at then raise exception 'Sales order changed; reload before continuing';end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 2000 then raise exception 'Amendment reason must be 3 to 2000 characters';end if;
  if exists(select 1 from public.crm_so_approvals where sales_order_id=s.id and status='pending') then raise exception 'Finish the pending SO approval first';end if;
  select * into a from public.crm_so_amendments where sales_order_id=s.id and status in ('pending','approved') for update;
  if found then if a.requested_by=u then return a;else raise exception 'An amendment is already open';end if;end if;
  insert into public.crm_so_amendments(sales_order_id,requested_by,reason,base_updated_at,before_snapshot,before_approval,status,approval_bypassed)
   values(s.id,u,btrim(p_note),s.updated_at,to_jsonb(s),(select to_jsonb(x) from public.crm_so_approvals x where x.sales_order_id=s.id),case when private.crm_edit_approval_required('so') then 'pending' else 'approved' end,not private.crm_edit_approval_required('so')) returning * into a;
 else
  select * into a from public.crm_so_amendments where id=p_request_id and sales_order_id=s.id for update;
  if not found then raise exception 'Amendment request not found';end if;
  if p_action='cancel' then
   if a.requested_by<>u or a.status not in ('pending','approved') then raise insufficient_privilege using message='Cannot withdraw this amendment';end if;
   update public.crm_so_amendments set status='cancelled' where id=a.id returning * into a;
  elsif p_action in ('approve','reject') then
   if not private.crm_can('quotations','approve') or a.requested_by=u then raise insufficient_privilege using message='Independent SO approver required';end if;
   if a.status<>'pending' then raise exception 'Amendment is no longer pending';end if;
   if s.status='cancelled' or s.updated_at is distinct from a.base_updated_at then raise exception 'Sales order changed; withdraw and request again';end if;
   if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required';end if;
   update public.crm_so_amendments set status=case p_action when 'approve' then 'approved' else 'rejected' end,
    reviewed_by=u,reviewed_at=clock_timestamp(),review_note=left(coalesce(p_note,''),2000) where id=a.id returning * into a;
  else raise exception 'Invalid amendment action';end if;
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,'amendment_'||p_action,left(coalesce(p_note,''),2000),u);
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(u,'update','quotations',s.quotation_id,jsonb_build_object('sales_order_id',s.id,'amendment_id',a.id,'amendment_action',p_action));
 return a;
end $function$;

CREATE OR REPLACE FUNCTION private.crm_save_so_amendment(p_request_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb)
 RETURNS crm_sales_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;a public.crm_so_amendments;f public.crm_sales_order_cost_sheets;
 item jsonb;old_item jsonb;idx integer:=0;old_idx integer;seen integer[]:='{}';price_id uuid;code text;vat_mode text;
 qty numeric;price numeric;disc numeric;cost numeric;factor numeric;cycles integer;line_net numeric;line_cost numeric;
 sub numeric:=0;line_disc numeric:=0;total_cost numeric:=0;doc_disc numeric;tax numeric;wht numeric;net numeric;gp numeric;
 v_items jsonb:='[]';financial jsonb:='[]';v_product_lines jsonb:='[]';line_sum numeric;assigned numeric:=0;allocation numeric;entry jsonb;
 details jsonb:='{}';k text;v text;at_time timestamptz:=clock_timestamp();stock_state text;period text;starts date;ends date;
 u uuid:=auth.uid();begin
 if u is null or not private.crm_active_user() or not private.crm_can('quotations','view') or not private.crm_can('quotations','edit') then raise insufficient_privilege using message='SO edit permission required';end if;
 -- Lock SO before request, matching every other SO operation.
 select s0.* into s from public.crm_sales_orders s0 join public.crm_so_amendments a0 on a0.sales_order_id=s0.id where a0.id=p_request_id for update of s0;
 if not found then raise exception 'Amendment request not found';end if;
 select * into a from public.crm_so_amendments where id=p_request_id for update;
 if u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can save this SO revision';end if;
 if a.status='applied' then return s;end if;
 perform 1 from public.crm_document_edit_settings where id for share;
 if a.status<>'approved' or (not (a.approval_bypassed and not private.crm_edit_approval_required('so')) and (a.reviewed_by is null or a.reviewed_by=u)) then raise insufficient_privilege using message='Approved amendment required';end if;
 if s.status='cancelled' or s.updated_at is distinct from p_expected_updated_at or s.updated_at is distinct from a.base_updated_at then raise exception 'Sales order changed; withdraw and request again';end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_patch->'items') is distinct from 'array' or jsonb_array_length(p_patch->'items') not between 1 and 500 then raise exception 'SO requires 1 to 500 v_items';end if;
 if length(btrim(coalesce(p_patch->>'po_number',''))) not between 1 and 200 or nullif(p_patch->>'po_date','') is null or (p_patch->>'po_date')::date>(at_time at time zone 'Asia/Bangkok')::date then raise exception 'Valid customer PO number and date required';end if;
 if nullif(p_patch->>'expected_delivery_date','')::date<(p_patch->>'po_date')::date then raise exception 'Delivery date cannot precede PO date';end if;
 if length(coalesce(p_patch->>'note',''))>5000 or length(coalesce(p_patch->>'billing_address',''))>5000 then raise exception 'SO text is too long';end if;
 -- Existing attached PO remains valid; replacements must be uploaded by this requester.
 if coalesce(p_patch->>'po_file_key',s.po_file_key)<>s.po_file_key then
  if split_part(p_patch->>'po_file_key','/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='crm-sales-orders' and name=p_patch->>'po_file_key') then raise exception 'Upload the customer PO file first';end if;
  if length(coalesce(p_patch->>'po_file_name','')) not between 1 and 255 then raise exception 'Invalid PO filename';end if;
 end if;
 if jsonb_typeof(p_patch->'delivery_details') is distinct from 'object' then raise exception 'Invalid delivery details';end if;
 foreach k in array array['order_type','ship_to_name','shipping_address','bill_to_name','billing_location','recipient_name','recipient_phone','installation'] loop
  v:=coalesce(p_patch->'delivery_details'->>k,'');if length(v)>2000 or (k='installation' and v not in ('','yes','no')) then raise exception 'Invalid delivery details';end if;details:=details||jsonb_build_object(k,v);
 end loop;
 tax:=(p_patch->>'tax_rate')::numeric;wht:=(p_patch->>'wht_rate')::numeric;doc_disc:=(p_patch->>'document_discount')::numeric;
 if tax is null or wht is null or doc_disc is null or not(tax between 0 and 100 and wht between 0 and 100 and doc_disc>=0 and doc_disc<1e12) then raise exception 'Invalid VAT, WHT or document discount';end if;
 select * into f from public.crm_sales_order_cost_sheets where sales_order_id=s.id for update;
 for item in select value from jsonb_array_elements(p_patch->'items') loop
  idx:=idx+1;old_item:=null;old_idx:=null;cost:=null;code:=null;vat_mode:=null;
  if item ? 'original_index' and item->>'original_index' is not null then
   old_idx:=(item->>'original_index')::integer;
   if old_idx<0 or old_idx>=jsonb_array_length(s.items) or old_idx=any(seen) then raise exception 'Invalid original item reference';end if;
   seen:=array_append(seen,old_idx);old_item:=s.items->old_idx;
  end if;
  price_id:=nullif(item->>'price_item_id','')::uuid;
  if old_item is null or nullif(old_item->>'price_item_id','')::uuid is distinct from price_id then
   if price_id is null then raise exception 'Select an active catalog product for a new item';end if;
   select p.code,p.cost,p.account360_vat_mode into code,cost,vat_mode from public.crm_price_items p where p.id=price_id and p.status='active';
   if not found then raise exception 'Catalog product unavailable';end if;
   if vat_mode='inclusive' then if tax<=0 then raise exception 'VAT-inclusive item requires positive VAT';end if;cost:=round(cost/(1+tax/100),2);end if;
   if vat_mode='exempt' and tax<>0 then raise exception 'VAT-exempt item requires zero VAT';end if;
  else
   code:=coalesce((select p.code from public.crm_price_items p where p.id=price_id),old_item->>'code','');
   factor:=case when old_item->>'billing_period'='once' then 1 else (old_item->>'qty')::numeric*coalesce((old_item->>'cycle_count')::integer,1) end;
   cost:=(f.line_financials->old_idx->>'cost_total')::numeric/nullif(factor,0);
  end if;
  -- Explicit revision costs are net of VAT and belong only to this SO revision.
  if item ? 'cost' then
   if not private.crm_quote_financial_access() then raise insufficient_privilege using message='Cost Sheet access required'; end if;
   if jsonb_typeof(item->'cost') not in ('number','string') or nullif(btrim(item->>'cost'),'') is null then raise exception 'Unit cost is required'; end if;
   cost:=(item->>'cost')::numeric;
  end if;
  if cost is null or not(cost>=0 and cost<1e12) then raise exception 'Valid unit cost required';end if;
  qty:=(item->>'qty')::numeric;price:=(item->>'price')::numeric;disc:=coalesce((item->>'discount')::numeric,0);cycles:=1;
  if s.quotation_kind='recurring' then
   period:=item->>'billing_period';cycles:=(item->>'cycle_count')::integer;starts:=(item->>'service_start')::date;
   if period not in ('day','month','year','once') or period is null or cycles is null or cycles not between 1 and 36600 or starts is null then raise exception 'Invalid recurring item';end if;
   ends:=case when period='once' then (item->>'service_end')::date else (starts+case period when 'day' then make_interval(days=>cycles) when 'month' then make_interval(months=>cycles) else make_interval(years=>cycles) end)::date-1 end;
   if ends is null or ends<starts or starts<(s.recurring->>'start_date')::date or ends>(s.recurring->>'end_date')::date or (period='once' and cycles<>1) then raise exception 'Service period must be within the contract';end if;
   if s.recurring#>>'{rental,payment}'='advance_months' and (period<>'month' or cycles<(s.recurring#>>'{rental,advance_months}')::integer) then raise exception 'Invalid advance payment cycles';end if;
  else period:=null;end if;
  factor:=case when period='once' then 1 else qty*cycles end;
  if length(btrim(coalesce(item->>'name','')))=0 or length(item->>'name')>1000 or qty is null or price is null or not(qty>0 and qty<1e9 and price>=0 and price<1e12 and disc>=0 and disc<=factor*price and cost>=0 and cost<1e12) then raise exception 'Invalid item quantity, price or discount';end if;
  line_net:=round(round(factor*price,2)-round(disc,2),2);line_cost:=round(factor*cost,2);sub:=sub+round(factor*price,2);line_disc:=line_disc+round(disc,2);total_cost:=total_cost+line_cost;
  entry:=jsonb_build_object('name',btrim(item->>'name'),'desc',left(coalesce(item->>'desc',''),5000),'unit',left(coalesce(item->>'unit','Unit'),100),'part_number',left(coalesce(item->>'part_number',''),200),'price_item_id',coalesce(price_id::text,''),'code',code,'qty',qty,'price',price,'discount',round(disc,2),'total',line_net,'serial_number',left(coalesce(item->>'serial_number',''),200));
  if period is not null then entry:=entry||jsonb_build_object('billing_period',period,'cycle_count',cycles,'service_start',starts,'service_end',ends);end if;
  v_items:=v_items||jsonb_build_array(entry);
  financial:=financial||jsonb_build_array(jsonb_build_object('cost_total',line_cost,'gp',line_net-line_cost,'margin',case when line_net=0 then 0 else round((line_net-line_cost)/line_net*100,2) end,'net',line_net));
 end loop;
 if doc_disc>sub-line_disc then raise exception 'Document discount exceeds order value';end if;
 doc_disc:=round(doc_disc,2);net:=round(sub-line_disc-doc_disc,2);gp:=net-total_cost;
 if s.recurring#>>'{rental,payment}'='partial' and coalesce((s.recurring#>>'{rental,partial_amount}')::numeric,0)>net+round(net*tax/100,2)-round(net*wht/100,2) then raise exception 'Amended total cannot be lower than the agreed rental advance';end if;
 line_sum:=sub-line_disc;idx:=0;
 for item in select value from jsonb_array_elements(v_items) loop
  idx:=idx+1;allocation:=greatest(0,least(net-assigned,case when idx=jsonb_array_length(v_items) then net-assigned when line_sum=0 then 0 else round((item->>'total')::numeric/line_sum*net,2) end));assigned:=assigned+allocation;
  v_product_lines:=v_product_lines||jsonb_build_array(jsonb_build_object('product',item->>'name','code',item->>'code','quantity',(item->>'qty')::numeric,'net_amount',allocation,'serial_number',item->>'serial_number'));
 end loop;
 update public.crm_so_amendments set status='applying' where id=a.id;
 -- Revenue-only edits do not touch stock. Identity changes reverse and reissue in this transaction.
 perform 1 from public.kc_dw_sales_order_facts where id=s.id and source_system='KC CuTo CRM' for update;
 if not found then raise exception 'Native sales fact missing';end if;
 if exists(select 1 from public.kc_dw_sales_order_facts x where x.id=s.id and private.crm_so_stock_identity(x.product_lines) is distinct from private.crm_so_stock_identity(v_product_lines)) then
  update public.kc_dw_sales_order_facts set status='voided',source_updated_at=clock_timestamp(),synced_at=clock_timestamp() where id=s.id;
 end if;
 update public.crm_sales_orders set po_number=btrim(p_patch->>'po_number'),po_date=(p_patch->>'po_date')::date,
  expected_delivery_date=nullif(p_patch->>'expected_delivery_date','')::date,po_file_key=coalesce(p_patch->>'po_file_key',s.po_file_key),po_file_name=coalesce(p_patch->>'po_file_name',s.po_file_name),
  billing_address=coalesce(p_patch->>'billing_address',s.billing_address),delivery_details=details,note=coalesce(p_patch->>'note',''),
  items=v_items,subtotal=sub,discount=line_disc+doc_disc,vat=round(net*tax/100,2),total=net+round(net*tax/100,2),withholding_tax=round(net*wht/100,2),net_total=net+round(net*tax/100,2)-round(net*wht/100,2),updated_at=clock_timestamp()
  where id=s.id returning * into s;
 update public.crm_sales_order_cost_sheets set cost_total=total_cost,gp_amount=gp,gp_margin=case when net=0 then 0 else round(gp/net*100,2) end,line_financials=financial,captured_at=clock_timestamp() where sales_order_id=s.id;
 insert into public.crm_so_amendment_cost_history(amendment_id,sales_order_id,before_cost_sheet,after_cost_sheet,saved_by) select a.id,s.id,to_jsonb(f),to_jsonb(c),u from public.crm_sales_order_cost_sheets c where c.sales_order_id=s.id;
 update public.kc_dw_sales_order_facts set net_amount=net,gross_profit=gp,product_lines=v_product_lines,status='converted',source_updated_at=clock_timestamp(),synced_at=clock_timestamp() where id=s.id;
 -- Invalidate the former signature and request approval of the revised document.
 insert into public.crm_so_approvals(sales_order_id,status,requested_by,revision,requested_at,reviewed_by,reviewed_at,review_note,updated_at)
 values(s.id,'pending',u,1,clock_timestamp(),null,null,'',clock_timestamp()) on conflict(sales_order_id) do update set status='pending',requested_by=u,revision=public.crm_so_approvals.revision+1,requested_at=clock_timestamp(),reviewed_by=null,reviewed_at=null,review_note='',signature_storage_key=null,reviewer_name=null,updated_at=clock_timestamp();
 update public.crm_so_amendments set status='applied',applied_at=clock_timestamp(),after_snapshot=to_jsonb(s) where id=a.id;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,'amendment_applied',a.reason,u);
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(u,'update','quotations',s.quotation_id,jsonb_build_object('sales_order_id',s.id,'amendment_id',a.id,'before',a.before_snapshot,'after',to_jsonb(s)));
 return s;
end $function$;

CREATE OR REPLACE FUNCTION private.crm_so_amendment_serials(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('quotations','view') or not private.crm_can('quotations','edit') then raise insufficient_privilege;end if;
 select f.product_lines into result from public.crm_so_amendments a join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id join public.crm_sales_orders s on s.id=a.sales_order_id where a.id=p_request_id and auth.uid()=coalesce(s.owner_id,s.created_by) and ((a.reviewed_by is not null and a.reviewed_by<>auth.uid()) or (a.approval_bypassed and not private.crm_edit_approval_required('so'))) and a.status='approved' and s.status<>'cancelled';
 if not found then raise insufficient_privilege using message='Approved amendment required';end if;return result;
end $function$;

CREATE OR REPLACE FUNCTION private.crm_so_stock_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 cfg public.crm_inventory_settings; run public.crm_so_stock_orders;
 line jsonb; item record; stock jsonb:='[]'; identity jsonb; entry jsonb;
 wh uuid; qty numeric; sn text; balance numeric; delta numeric; line_no integer:=0;
 movement_kind text; next_state text; next_cycle integer; amending boolean;
begin
 -- The fact row is already locked by INSERT/UPSERT; the shared settings lock serializes with manual stock postings.
 select * into cfg from public.crm_inventory_settings where id for update;
 select * into run from public.crm_so_stock_orders where so_id=new.id for update;
 if not found then
  if tg_op<>'INSERT' or not cfg.auto_issue_on_so or new.status<>'converted'
    or cfg.so_stock_enabled_at is null or new.converted_at<cfg.so_stock_enabled_at then
   insert into public.crm_so_stock_orders(so_id,state) values(new.id,'excluded');
   return new;
  end if;
  run.state:=null; run.cycle:=0;
 end if;
 if run.state='excluded' then return new; end if;
 amending:=exists(select 1 from public.crm_so_amendments a join public.crm_sales_orders s on s.id=a.sales_order_id where a.sales_order_id=new.id and a.status='applying' and auth.uid()=coalesce(s.owner_id,s.created_by) and (a.reviewed_by<>auth.uid() or (a.approval_bypassed and not private.crm_edit_approval_required('so'))));
 identity:=private.crm_so_stock_identity(new.product_lines);
 if run.state in ('issued','reversed') and new.status='converted' and identity is distinct from run.source_lines and not amending then
  raise exception 'SO stock lines are locked after issue. Cancel this SO and open a new SO for changed items or quantities';
 end if;
 if run.state='issued' and new.status='converted' then return new; end if;
 if run.state='reversed' and new.status in ('cancelled','voided') then return new; end if;
 if run.state='issued' and new.status in ('cancelled','voided') then
  stock:=run.stock_lines; movement_kind:='receipt'; next_state:='reversed'; next_cycle:=run.cycle;
 else
  if new.status<>'converted' then return new; end if;
  if not cfg.enabled or not cfg.auto_issue_on_so then raise exception 'Enable SO stock control before reopening this SO'; end if;
  if jsonb_array_length(new.product_lines)=0 then raise exception 'SO stock requires product lines with mapped product codes and explicit quantities'; end if;
  for line in select value from jsonb_array_elements(new.product_lines) loop
   select p.id,p.status,d.stock_mode,d.track_serial into item from public.crm_price_items p
    join public.crm_item_details d on d.id=p.id where p.code=line->>'code';
   if not found or item.status<>'active' then raise exception 'SO product code is missing, inactive or not mapped: %',coalesce(line->>'code',''); end if;
   if item.stock_mode<>'stock' then continue; end if;
   if jsonb_typeof(line->'quantity') is distinct from 'number' then raise exception 'SO stock quantity is required for %',line->>'code'; end if;
   qty:=(line->>'quantity')::numeric;
   if not(qty>0 and qty<1000000000) then raise exception 'Invalid SO stock quantity'; end if;
   wh:=coalesce(nullif(line->>'warehouse_id','')::uuid,cfg.default_warehouse_id);
   sn:=btrim(coalesce(line->>'serial_number',''));
   if not exists(select 1 from public.crm_warehouses where id=wh and active) then raise exception 'SO stock requires an active warehouse'; end if;
   if length(sn)>200 or (item.track_serial and (sn='' or qty<>1)) or (not item.track_serial and sn<>'') then
    raise exception 'Serial-tracked SO lines require quantity one and a serial number'; end if;
   stock:=stock||jsonb_build_array(jsonb_build_object('item_id',item.id,'warehouse_id',wh,'quantity',qty,'serial_number',sn,'track_serial',item.track_serial));
  end loop;
  -- A reopened SO uses the warehouse snapshot from its original issue.
  if run.state='reversed' and not amending then stock:=run.stock_lines; end if;
  movement_kind:='issue'; next_state:='issued'; next_cycle:=run.cycle+1;
 end if;
 for entry in select value from jsonb_array_elements(stock) loop
  line_no:=line_no+1; wh:=(entry->>'warehouse_id')::uuid; qty:=(entry->>'quantity')::numeric; sn:=entry->>'serial_number';
  delta:=case when movement_kind='issue' then -qty else qty end;
  if movement_kind='issue' and (not exists(select 1 from public.crm_warehouses where id=wh and active)
   or not exists(select 1 from public.crm_price_items where id=(entry->>'item_id')::uuid and status='active')) then
   raise exception 'SO stock requires active items and warehouses'; end if;
  insert into public.crm_stock_balances(warehouse_id,item_id,serial_number)
   values(wh,(entry->>'item_id')::uuid,sn) on conflict(warehouse_id,item_id,serial_number) do nothing;
  select quantity into balance from public.crm_stock_balances
   where warehouse_id=wh and item_id=(entry->>'item_id')::uuid and serial_number=sn for update;
  if balance+delta<0 and (not cfg.allow_negative or (entry->>'track_serial')::boolean) then raise exception 'Insufficient stock for SO %',new.so_number; end if;
  if movement_kind='receipt' and (entry->>'track_serial')::boolean and exists(
   select 1 from public.crm_stock_balances where item_id=(entry->>'item_id')::uuid and serial_number=sn and quantity>0
  ) then raise exception 'Cannot reverse SO: serial number is already in stock'; end if;
  update public.crm_stock_balances set quantity=quantity+delta
   where warehouse_id=wh and item_id=(entry->>'item_id')::uuid and serial_number=sn;
  insert into public.crm_stock_movements(id,kind,item_id,warehouse_id,serial_number,quantity,reason,created_by,request,source_so_id,source_so_cycle,source_so_line)
   values(gen_random_uuid(),movement_kind,(entry->>'item_id')::uuid,wh,sn,qty,
    case when movement_kind='issue' then 'SO opened: ' else 'SO cancelled/voided: ' end||new.so_number,
    null,jsonb_build_object('source','sales_order','source_system',new.source_system,'source_so_id',new.source_so_id,'cycle',next_cycle,'line',line_no,'stock',entry),new.id,next_cycle,line_no);
 end loop;
 insert into public.crm_so_stock_orders(so_id,state,cycle,source_lines,stock_lines)
  values(new.id,next_state,next_cycle,identity,stock)
 on conflict(so_id) do update set state=excluded.state,cycle=excluded.cycle,source_lines=excluded.source_lines,stock_lines=excluded.stock_lines,updated_at=clock_timestamp();
 return new;
end $function$;

