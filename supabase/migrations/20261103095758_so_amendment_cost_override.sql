create table if not exists public.crm_so_amendment_cost_history(
 amendment_id uuid primary key references public.crm_so_amendments(id),
 sales_order_id uuid not null references public.crm_sales_orders(id),
 before_cost_sheet jsonb not null,after_cost_sheet jsonb not null,
 saved_by uuid not null references public.profiles(id),saved_at timestamptz not null default clock_timestamp()
);
alter table public.crm_so_amendment_cost_history enable row level security;
revoke all on public.crm_so_amendment_cost_history from public,anon,authenticated;
grant select on public.crm_so_amendment_cost_history to authenticated;
create policy amendment_cost_history_read on public.crm_so_amendment_cost_history for select to authenticated
 using(private.crm_quote_financial_access() and exists(select 1 from public.crm_sales_orders s where s.id=sales_order_id));
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
end $function$

