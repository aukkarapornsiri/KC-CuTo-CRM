alter table public.crm_sales_orders add column delivery_details jsonb not null default '{}'::jsonb check(jsonb_typeof(delivery_details)='object');
create function private.crm_sales_order_create_with_details(p_quotation_id uuid,p_po_number text,p_po_date date,p_file_key text,p_file_name text,p_delivery_date date,p_note text,p_serials jsonb,p_details jsonb)
returns public.crm_sales_orders language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders;clean jsonb:='{}';k text;v text;
begin
 if auth.uid() is null or not private.crm_can('quotations','view') or not private.crm_can('quotations','create') then raise insufficient_privilege using message='Sales order creation permission required';end if;
 perform 1 from public.quotations where id=p_quotation_id for update;
 select * into s from public.crm_sales_orders where quotation_id=p_quotation_id;
 if found then return s;end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid delivery details';end if;
 foreach k in array array['order_type','ship_to_name','shipping_address','bill_to_name','billing_location','recipient_name','recipient_phone','installation'] loop
  v:=coalesce(p_details->>k,'');
  if length(v)>2000 then raise exception 'Delivery detail exceeds 2000 characters';end if;
  if k='installation' and v not in ('','yes','no') then raise exception 'Invalid installation choice';end if;
  clean:=clean||jsonb_build_object(k,v);
 end loop;
 s:=private.crm_sales_order_create(p_quotation_id,p_po_number,p_po_date,p_file_key,p_file_name,p_delivery_date,p_note,p_serials);
 update public.crm_sales_orders set delivery_details=clean where id=s.id returning * into s;
 return s;
end $$;
revoke all on function private.crm_sales_order_create_with_details(uuid,text,date,text,text,date,text,jsonb,jsonb) from public,anon;
grant execute on function private.crm_sales_order_create_with_details(uuid,text,date,text,text,date,text,jsonb,jsonb) to authenticated;
create function public.crm_create_sales_order_with_details(p_quotation_id uuid,p_po_number text,p_po_date date,p_file_key text,p_file_name text,p_delivery_date date default null,p_note text default '',p_serials jsonb default '{}',p_details jsonb default '{}')
returns public.crm_sales_orders language sql security invoker set search_path='' as $$ select private.crm_sales_order_create_with_details(p_quotation_id,p_po_number,p_po_date,p_file_key,p_file_name,p_delivery_date,p_note,p_serials,p_details); $$;
revoke all on function public.crm_create_sales_order_with_details(uuid,text,date,text,text,date,text,jsonb,jsonb) from public,anon;
grant execute on function public.crm_create_sales_order_with_details(uuid,text,date,text,text,date,text,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
