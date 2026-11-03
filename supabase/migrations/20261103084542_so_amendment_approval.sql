-- Request -> independent approval -> one save -> renewed SO approval.
-- All document, revenue, cost and stock writes commit or roll back together.
create table public.crm_so_amendments (
 id uuid primary key default gen_random_uuid(),
 sales_order_id uuid not null references public.crm_sales_orders(id),
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default clock_timestamp(),
 reason text not null check(length(btrim(reason)) between 3 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','applying','applied')),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,review_note text not null default '',
 base_updated_at timestamptz not null,before_snapshot jsonb not null,before_approval jsonb,after_snapshot jsonb,
 applied_at timestamptz,
 check(reviewed_by is null or reviewed_by<>requested_by)
);
create unique index crm_so_one_open_amendment on public.crm_so_amendments(sales_order_id) where status in ('pending','approved','applying');
create index crm_so_amendments_history on public.crm_so_amendments(sales_order_id,requested_at desc);
alter table public.crm_so_amendments enable row level security;
revoke all on public.crm_so_amendments from public,anon,authenticated;
grant select on public.crm_so_amendments to authenticated;
create policy so_amendments_read on public.crm_so_amendments for select to authenticated
 using ((select private.crm_active_user()) and (select private.crm_can('quotations','view'))
 and (requested_by=(select auth.uid()) or (select private.crm_can('quotations','approve')) or exists(select 1 from public.crm_sales_orders s where s.id=sales_order_id and (s.owner_id=(select auth.uid()) or s.created_by=(select auth.uid())))));

create function private.crm_so_amendment_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders;dest uuid;begin
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 if tg_op='UPDATE' and new.status=old.status then return null;end if;
 if new.status='pending' then
  for dest in select p.id from public.profiles p left join public.role_permissions r
   on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module='quotations'
   where p.is_active and p.deleted_at is null and p.id<>new.requested_by and (p.is_super_admin or coalesce(r.can_approve,false))
  loop
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(dest,'approval','ขอแก้ไข SO / Request SO amendment • '||s.code,new.reason,'quotations',s.quotation_id,
    'so-amendment:'||new.id||':pending:'||dest,'approval_requested','high') on conflict do nothing;
  end loop;
 else
  update public.notifications set resolved_at=clock_timestamp(),resolution=new.status where resolved_at is null and event_key like 'so-amendment:'||new.id||':pending:%';
  if new.status in ('approved','rejected') then
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(new.requested_by,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
    new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status,'approval_resolved','high') on conflict do nothing;
  end if;
 end if;return null;
end $$;
revoke all on function private.crm_so_amendment_notify() from public,anon,authenticated;
create trigger crm_so_amendment_notify after insert or update on public.crm_so_amendments for each row execute function private.crm_so_amendment_notify();

create function private.crm_so_amendment_action(p_sales_order_id uuid,p_action text,p_note text,p_expected_updated_at timestamptz,p_request_id uuid)
returns public.crm_so_amendments language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders;a public.crm_so_amendments;u uuid:=auth.uid();begin
 if u is null or not private.crm_active_user() or not private.crm_can('quotations','view') then raise insufficient_privilege using message='SO access denied';end if;
 select * into s from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found';end if;
 if p_action='request' then
  if not private.crm_can('quotations','edit') or (s.owner_id<>u and s.created_by<>u and not private.crm_can('quotations','approve')) then raise insufficient_privilege using message='Only the responsible user can request an SO amendment';end if;
  if s.status='cancelled' then raise exception 'Cancelled SO cannot be amended';end if;
  if s.updated_at is distinct from p_expected_updated_at then raise exception 'Sales order changed; reload before continuing';end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 2000 then raise exception 'Amendment reason must be 3 to 2000 characters';end if;
  if exists(select 1 from public.crm_so_approvals where sales_order_id=s.id and status='pending') then raise exception 'Finish the pending SO approval first';end if;
  select * into a from public.crm_so_amendments where sales_order_id=s.id and status in ('pending','approved') for update;
  if found then if a.requested_by=u then return a;else raise exception 'An amendment is already open';end if;end if;
  insert into public.crm_so_amendments(sales_order_id,requested_by,reason,base_updated_at,before_snapshot,before_approval)
   values(s.id,u,btrim(p_note),s.updated_at,to_jsonb(s),(select to_jsonb(x) from public.crm_so_approvals x where x.sales_order_id=s.id)) returning * into a;
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
end $$;
create function public.crm_so_amendment_action(p_sales_order_id uuid,p_action text,p_note text default '',p_expected_updated_at timestamptz default null,p_request_id uuid default null)
returns public.crm_so_amendments language sql security invoker set search_path='' as $$ select private.crm_so_amendment_action(p_sales_order_id,p_action,p_note,p_expected_updated_at,p_request_id);$$;
revoke all on function private.crm_so_amendment_action(uuid,text,text,timestamptz,uuid),public.crm_so_amendment_action(uuid,text,text,timestamptz,uuid) from public,anon;
grant execute on function private.crm_so_amendment_action(uuid,text,text,timestamptz,uuid),public.crm_so_amendment_action(uuid,text,text,timestamptz,uuid) to authenticated;

create function private.crm_save_so_amendment(p_request_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
returns public.crm_sales_orders language plpgsql security definer set search_path='' as $$
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
 if a.requested_by<>u then raise insufficient_privilege using message='Only the approved requester can save';end if;
 if a.status='applied' then return s;end if;
 if a.status<>'approved' or a.reviewed_by is null or a.reviewed_by=u then raise insufficient_privilege using message='Approved amendment required';end if;
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
  if cost is null then raise exception 'Cost snapshot unavailable; contact an administrator';end if;
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
 update public.kc_dw_sales_order_facts set net_amount=net,gross_profit=gp,product_lines=v_product_lines,status='converted',source_updated_at=clock_timestamp(),synced_at=clock_timestamp() where id=s.id;
 -- Invalidate the former signature and request approval of the revised document.
 insert into public.crm_so_approvals(sales_order_id,status,requested_by,revision,requested_at,reviewed_by,reviewed_at,review_note,updated_at)
 values(s.id,'pending',u,1,clock_timestamp(),null,null,'',clock_timestamp()) on conflict(sales_order_id) do update set status='pending',requested_by=u,revision=public.crm_so_approvals.revision+1,requested_at=clock_timestamp(),reviewed_by=null,reviewed_at=null,review_note='',signature_storage_key=null,reviewer_name=null,updated_at=clock_timestamp();
 update public.crm_so_amendments set status='applied',applied_at=clock_timestamp(),after_snapshot=to_jsonb(s) where id=a.id;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,'amendment_applied',a.reason,u);
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(u,'update','quotations',s.quotation_id,jsonb_build_object('sales_order_id',s.id,'amendment_id',a.id,'before',a.before_snapshot,'after',to_jsonb(s)));
 return s;
end $$;
create function public.crm_save_so_amendment(p_request_id uuid,p_expected_updated_at timestamptz,p_patch jsonb) returns public.crm_sales_orders language sql security invoker set search_path='' as $$select private.crm_save_so_amendment(p_request_id,p_expected_updated_at,p_patch);$$;
revoke all on function private.crm_save_so_amendment(uuid,timestamptz,jsonb),public.crm_save_so_amendment(uuid,timestamptz,jsonb) from public,anon;
grant execute on function private.crm_save_so_amendment(uuid,timestamptz,jsonb),public.crm_save_so_amendment(uuid,timestamptz,jsonb) to authenticated;

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
 amending:=exists(select 1 from public.crm_so_amendments a where a.sales_order_id=new.id and a.status='applying' and a.requested_by=auth.uid() and a.reviewed_by<>auth.uid());
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

CREATE OR REPLACE FUNCTION private.crm_so_approval_action(p_sales_order_id uuid, p_action text, p_note text DEFAULT ''::text)
 RETURNS crm_so_approvals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.crm_sales_orders; a public.crm_so_approvals; u uuid:=auth.uid();
begin
 if u is null or not private.crm_active_user() then raise exception 'Login required' using errcode='42501'; end if;
 if p_action not in ('request','approve','reject') then raise exception 'Invalid approval action'; end if;
 select * into o from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found'; end if;
 if o.status='cancelled' or (o.status in ('completed','delivered') and not exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied' and m.applied_at>= (select requested_at-interval '1 second' from public.crm_so_approvals where sales_order_id=o.id))) then raise exception 'Sales order is not eligible for approval'; end if;
 if p_action='request' then
  if not (private.crm_can('quotations','create') and (o.owner_id=u or o.created_by=u)) and not private.crm_can('quotations','approve') then
   raise exception 'Not allowed to request approval' using errcode='42501';
  end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if found and a.status='approved' then raise exception 'Sales order already approved'; end if;
  if found and a.status='pending' then return a; end if;
  insert into public.crm_so_approvals(sales_order_id,requested_by,revision,status,requested_at,review_note,reviewed_by,reviewed_at,updated_at)
  values(p_sales_order_id,u,coalesce(a.revision,0)+1,'pending',now(),' ',null,null,now())
  on conflict(sales_order_id) do update set
    status='pending',requested_by=excluded.requested_by,requested_at=now(),
    reviewed_by=null,reviewed_at=null,review_note='',revision=public.crm_so_approvals.revision+1,updated_at=now()
  returning * into a;
 else
  if not private.crm_can('quotations','approve') then raise exception 'SO approve permission required' using errcode='42501'; end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if a.requested_by=u and exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied') then raise insufficient_privilege using message='Independent SO approver required';end if;
  if not found or a.status<>'pending' then raise exception 'SO has no pending approval'; end if;
  if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required'; end if;
  update public.crm_so_approvals set status=case when p_action='approve' then 'approved' else 'rejected' end,
  reviewed_by=u,reviewed_at=now(),review_note=left(coalesce(p_note,''),2000),updated_at=now()
  where sales_order_id=p_sales_order_id returning * into a;
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id)
 values(p_sales_order_id,'so_approval_'||p_action,coalesce(p_note,''),u);
 insert into public.audit_logs(user_id,action,module,record_id,changes)
 values(u,'update','quotations',o.quotation_id,
 jsonb_build_object('sales_order_id',o.id,'approval_action',p_action,'status',a.status,'revision',a.revision,'note',left(coalesce(p_note,''),2000)));
 return a;
end $function$;




create function private.crm_so_amendment_transition_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and exists(select 1 from public.crm_so_amendments where sales_order_id=new.id and status in ('pending','approved','applying')) then raise exception 'Finish or withdraw the open amendment before changing SO status';end if;return new;
end $$;
revoke all on function private.crm_so_amendment_transition_guard() from public,anon,authenticated;
create trigger crm_so_amendment_transition_guard before update of status on public.crm_sales_orders for each row execute function private.crm_so_amendment_transition_guard();
notify pgrst,'reload schema';
