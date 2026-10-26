-- One conversion approval; quotation approval is no longer a prerequisite.
create or replace function private.crm_sales_order_create(p_quotation_id uuid,p_po_number text,p_po_date date,p_file_key text,p_file_name text,
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
 if q.status is null or q.status not in ('draft','approved','sent','accepted') or q.approval_status='rejected' then
  raise exception 'Quotation is not eligible for Convert Sales Order'; end if;
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
 -- Submit exactly one SO approval in the same transaction as creation.
 -- Failure rolls back the SO, sales facts, inventory effects and notifications.
 perform private.crm_so_approval_action(s.id,'request','');
 return s;
end $$;

notify pgrst,'reload schema';
