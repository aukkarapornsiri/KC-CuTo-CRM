-- Native CRM sales orders. No outbound accounting integration.
create sequence private.crm_sales_order_number;
revoke all on sequence private.crm_sales_order_number from public,anon,authenticated;
create table public.crm_sales_orders (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 quotation_id uuid not null unique references public.quotations(id),
 quotation_code text not null,
 customer_id uuid not null references public.customers(id),
 customer_name text not null,
 owner_id uuid not null references public.profiles(id),
 owner_name text not null default '',
 billing_address text not null default '',
 tax_id text not null default '',
 po_number text not null check(length(btrim(po_number)) between 1 and 200),
 po_date date not null,
 po_file_key text not null,
 po_file_name text not null,
 expected_delivery_date date,
 status text not null default 'confirmed' check(status in ('confirmed','delivered','completed','cancelled')),
 items jsonb not null check(jsonb_typeof(items)='array'),
 subtotal numeric not null,discount numeric not null,vat numeric not null,total numeric not null,
 withholding_tax numeric not null,net_total numeric not null,
 currency text not null,payment_terms integer not null default 0,
 note text not null default '',
 delivery_reference text,delivered_at timestamptz,completed_at timestamptz,
 cancellation_reason text,cancelled_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index crm_sales_orders_newest on public.crm_sales_orders(created_at desc,id desc);
create index crm_sales_orders_customer on public.crm_sales_orders(customer_id);
create table public.crm_sales_order_events (
 id uuid primary key default gen_random_uuid(),
 sales_order_id uuid not null references public.crm_sales_orders(id),
 action text not null,note text not null default '',
 actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create index crm_sales_order_events_order on public.crm_sales_order_events(sales_order_id,created_at desc);
alter table public.crm_sales_orders enable row level security;
alter table public.crm_sales_order_events enable row level security;
revoke all on public.crm_sales_orders,public.crm_sales_order_events from public,anon,authenticated;
grant select on public.crm_sales_orders,public.crm_sales_order_events to authenticated;
create policy crm_so_view on public.crm_sales_orders for select to authenticated using(private.crm_can('quotations','view'));
create policy crm_so_events_view on public.crm_sales_order_events for select to authenticated using(private.crm_can('quotations','view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-sales-orders','crm-sales-orders',false,20971520,array['application/pdf','image/jpeg','image/png']);
create policy crm_so_file_upload on storage.objects for insert to authenticated with check(
 bucket_id='crm-sales-orders' and (storage.foldername(name))[1]=auth.uid()::text
 and private.crm_can('quotations','view') and private.crm_can('quotations','create'));
create policy crm_so_file_read on storage.objects for select to authenticated using(
 bucket_id='crm-sales-orders' and private.crm_can('quotations','view') and
 ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.crm_sales_orders s where s.po_file_key=name)));
create policy crm_so_file_remove_unused on storage.objects for delete to authenticated using(
 bucket_id='crm-sales-orders' and (storage.foldername(name))[1]=auth.uid()::text
 and private.crm_can('quotations','create') and not exists(select 1 from public.crm_sales_orders s where s.po_file_key=name));

-- Exposed wrappers are invokers. The private workers are the only mutation
-- boundary, check active identity and matrix rights, and derive all money and
-- customer/owner fields from a locked approved quotation, never client values.
create function private.crm_sales_order_create(p_quotation_id uuid,p_po_number text,p_po_date date,p_file_key text,p_file_name text,
 p_delivery_date date,p_note text,p_serials jsonb) returns public.crm_sales_orders
language plpgsql security definer set search_path='' as $$
declare q public.quotations; s public.crm_sales_orders; seller public.profiles; product_lines jsonb:='[]';
 item jsonb; idx integer:=0; item_code text; line_value numeric; line_sum numeric; assigned numeric:=0; net numeric;
 at_time timestamptz:=clock_timestamp(); so_code text; serial text; gp numeric;
begin
 if auth.uid() is null or not (private.crm_can('quotations','view') and private.crm_can('quotations','create')) then
  raise exception 'Sales order creation permission required' using errcode='42501'; end if;
 select * into q from public.quotations where id=p_quotation_id for update;
 if not found then raise exception 'Quotation not found'; end if;
 -- Serializes concurrent conversions and makes retries return the same SO.
 select * into s from public.crm_sales_orders where quotation_id=q.id;
 if found then return s; end if;
 if q.approval_status is distinct from 'approved' or q.status not in ('approved','sent','accepted') then
  raise exception 'Quotation must be approved before opening a sales order'; end if;
 if q.customer_id is null or q.owner_id is null then raise exception 'Customer and salesperson are required'; end if;
 select * into seller from public.profiles where id=q.owner_id and is_active and deleted_at is null;
 if not found or nullif(btrim(seller.email),'') is null then raise exception 'Active salesperson with email required'; end if;
 if length(btrim(coalesce(p_po_number,''))) not between 1 and 200 or p_po_date is null
    or p_po_date>(at_time at time zone 'Asia/Bangkok')::date then raise exception 'Valid customer PO number and date required'; end if;
 if p_delivery_date<p_po_date then raise exception 'Delivery date cannot precede PO date'; end if;
 if length(coalesce(p_note,''))>5000 or length(coalesce(p_file_name,'')) not between 1 and 255 then raise exception 'Invalid note or PO filename'; end if;
 if p_file_key is null or split_part(p_file_key,'/',1)<>auth.uid()::text or not exists(
   select 1 from storage.objects where bucket_id='crm-sales-orders' and name=p_file_key
 ) then raise exception 'Upload the customer PO file first'; end if;
 if jsonb_typeof(p_serials) is distinct from 'object' then raise exception 'Invalid serial numbers'; end if;
 if jsonb_typeof(q.items)<>'array' or jsonb_array_length(q.items)=0 then raise exception 'Quotation items required'; end if;
 net:=round(q.subtotal-q.discount,2);
 if net<0 then raise exception 'Invalid quotation amount'; end if;
 select sum((x->>'total')::numeric) into line_sum from jsonb_array_elements(q.items)x;
 for item in select value from jsonb_array_elements(q.items) loop
  idx:=idx+1;
  item_code:=null;
  if nullif(item->>'price_item_id','') is not null then
   select code into item_code from public.crm_price_items where id=(item->>'price_item_id')::uuid;
  end if;
  item_code:=coalesce(item_code,item->>'code','');
  line_value:=case when idx=jsonb_array_length(q.items) then net-assigned
    when coalesce(line_sum,0)=0 then 0 else round((item->>'total')::numeric/line_sum*net,2) end;
  -- Cap rounding allocation so all lines remain nonnegative.
  line_value:=greatest(0,least(net-assigned,line_value));assigned:=assigned+line_value;
  serial:=btrim(coalesce(p_serials->>(idx-1)::text,''));
  if length(serial)>200 then raise exception 'Serial number too long'; end if;
  product_lines:=product_lines||jsonb_build_array(jsonb_build_object('product',item->>'name','code',item_code,
   'quantity',(item->>'qty')::numeric,'net_amount',line_value,'serial_number',serial));
 end loop;
 so_code:='SO-'||to_char(at_time at time zone 'Asia/Bangkok','YYYYMM')||'-'||lpad(nextval('private.crm_sales_order_number')::text,6,'0');
 insert into public.crm_sales_orders(code,quotation_id,quotation_code,customer_id,customer_name,owner_id,owner_name,
 billing_address,tax_id,po_number,po_date,po_file_key,po_file_name,expected_delivery_date,items,subtotal,discount,vat,total,
 withholding_tax,net_total,currency,payment_terms,note,created_by)
 values(so_code,q.id,q.code,q.customer_id,coalesce(q.customer_name,''),q.owner_id,coalesce(q.owner_name,seller.display_name,''),
 coalesce(q.counterparty_address,''),coalesce(q.counterparty_tax_id,''),btrim(p_po_number),p_po_date,p_file_key,p_file_name,
 p_delivery_date,q.items,q.subtotal,q.discount,q.vat,q.total,coalesce(q.withholding_tax,0),coalesce(q.net_total,q.total),
 q.currency,coalesce(q.payment_terms,0),coalesce(p_note,''),auth.uid()) returning * into s;
 select gp_amount into gp from public.crm_quotation_financials where quotation_id=q.id;
 -- Reuse the internal facts consumed by CRM dashboards and the existing stock
 -- trigger. The insert and any stock issue share this transaction with the SO.
 insert into public.kc_dw_sales_order_facts(id,source_system,source_so_id,so_number,sales_email,sales_name,converted_at,period_month,
 net_amount,gross_profit,status,source_updated_at,customer_id,customer_name,product_lines,currency)
 values(s.id,'KC CuTo CRM',s.id::text,s.code,seller.email,s.owner_name,at_time,date_trunc('month',at_time at time zone 'Asia/Bangkok')::date,
 net,coalesce(gp,0),'converted',at_time,s.customer_id,s.customer_name,product_lines,s.currency);
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,'confirmed',s.po_number,auth.uid());
 insert into public.audit_logs(user_id,action,module,record_id,changes)
 values(auth.uid(),'create','quotations',q.id,jsonb_build_object('sales_order_id',s.id,'sales_order_code',s.code,'po_number',s.po_number));
 return s;
end $$;

create function public.crm_create_sales_order(p_quotation_id uuid,p_po_number text,p_po_date date,p_file_key text,p_file_name text,
 p_delivery_date date default null,p_note text default '',p_serials jsonb default '{}') returns public.crm_sales_orders
language sql security invoker set search_path='' as $$
 select private.crm_sales_order_create(p_quotation_id,p_po_number,p_po_date,p_file_key,p_file_name,p_delivery_date,p_note,p_serials);
$$;

create function private.crm_sales_order_transition(p_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz)
returns public.crm_sales_orders language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders; previous_status text;
begin
 if auth.uid() is null or not private.crm_can('quotations','view') or not private.crm_can('quotations',
   case when p_status='cancelled' then 'approve' else 'edit' end) then raise exception 'Sales order action permission required' using errcode='42501'; end if;
 select * into s from public.crm_sales_orders where id=p_id for update;
 if not found then raise exception 'Sales order not found'; end if;
 if s.status=p_status then return s; end if;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'Sales order changed; reload before continuing'; end if;
 if not ((s.status='confirmed' and p_status in ('delivered','cancelled')) or (s.status='delivered' and p_status='completed')) then
  raise exception 'Invalid sales order transition'; end if;
 if p_status in ('delivered','cancelled') and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Delivery reference or cancellation reason required'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note too long'; end if;
 previous_status:=s.status;
 update public.crm_sales_orders set status=p_status,updated_at=clock_timestamp(),
 delivered_at=case when p_status='delivered' then clock_timestamp() else delivered_at end,
 delivery_reference=case when p_status='delivered' then btrim(p_note) else delivery_reference end,
 completed_at=case when p_status='completed' then clock_timestamp() else completed_at end,
 cancelled_at=case when p_status='cancelled' then clock_timestamp() else cancelled_at end,
 cancellation_reason=case when p_status='cancelled' then btrim(p_note) else cancellation_reason end
 where id=s.id returning * into s;
 if p_status='cancelled' then
  update public.kc_dw_sales_order_facts set status='cancelled',source_updated_at=clock_timestamp(),synced_at=clock_timestamp()
  where id=s.id and source_system='KC CuTo CRM';
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,p_status,coalesce(p_note,''),auth.uid());
 insert into public.audit_logs(user_id,action,module,record_id,changes)
 values(auth.uid(),'update','quotations',s.quotation_id,jsonb_build_object('sales_order_id',s.id,'from',previous_status,'to',p_status,'note',p_note));
 return s;
end $$;
create function public.crm_transition_sales_order(p_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz)
returns public.crm_sales_orders language sql security invoker set search_path='' as $$
 select private.crm_sales_order_transition(p_id,p_status,p_note,p_expected_updated_at);
$$;
revoke all on function private.crm_sales_order_create(uuid,text,date,text,text,date,text,jsonb),
 public.crm_create_sales_order(uuid,text,date,text,text,date,text,jsonb),private.crm_sales_order_transition(uuid,text,text,timestamptz),
 public.crm_transition_sales_order(uuid,text,text,timestamptz) from public,anon;
grant execute on function private.crm_sales_order_create(uuid,text,date,text,text,date,text,jsonb),
 public.crm_create_sales_order(uuid,text,date,text,text,date,text,jsonb),private.crm_sales_order_transition(uuid,text,text,timestamptz),
 public.crm_transition_sales_order(uuid,text,text,timestamptz) to authenticated;
