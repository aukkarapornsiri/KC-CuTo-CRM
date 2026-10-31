-- Additive rental support. No historical row updates.
CREATE OR REPLACE FUNCTION private.crm_quote_recurring_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb;clean jsonb:='[]';period text;cycles integer;starts date;ends date;contract_start date;contract_end date;
begin
 if tg_op='UPDATE' and new.quotation_kind is not distinct from old.quotation_kind and new.recurring is not distinct from old.recurring and new.items is not distinct from old.items then return new;end if;
 if new.quotation_kind='standard' then
  if exists(select 1 from jsonb_array_elements(new.items) x where nullif(x->>'billing_period','') is not null) then raise exception 'Standard quotation cannot have billing cycles';end if;
  new.recurring:='{}';return new;
 end if;
 if new.quotation_kind is distinct from 'recurring' then raise exception 'Invalid quotation type';end if;
 if coalesce(new.recurring->>'start_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(new.recurring->>'end_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(new.recurring->>'billing_timing','') not in ('advance','arrears','advance_once') then raise exception 'Invalid contract period or billing timing';end if;
 contract_start:=(new.recurring->>'start_date')::date;contract_end:=(new.recurring->>'end_date')::date;
 if contract_end<contract_start then raise exception 'Invalid contract dates';end if;
 for item in select * from jsonb_array_elements(new.items) loop
  period:=item->>'billing_period';
  if coalesce(period,'') not in ('day','month','year','once') or coalesce(item->>'cycle_count','') !~ '^[0-9]+$' then raise exception 'Invalid billing period or cycles';end if;
  cycles:=(item->>'cycle_count')::integer;
  if cycles not between 1 and 36600 or coalesce(item->>'service_start','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid cycles or service start';end if;
  starts:=(item->>'service_start')::date;
  if period='once' then
   if cycles<>1 or coalesce(item->>'service_end','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid lump-sum rental';end if;
   ends:=(item->>'service_end')::date;
  else
  ends:=(starts+case period when 'day' then make_interval(days=>cycles) when 'month' then make_interval(months=>cycles) else make_interval(years=>cycles) end)::date-1;
  end if;
  if starts<contract_start or ends>contract_end or ends<starts then raise exception 'Service period must be within the contract';end if;
  clean:=clean||jsonb_build_array(item||jsonb_build_object('cycle_count',cycles,'service_end',ends::text));
 end loop;
 if new.recurring ? 'rental' then
  if new.recurring#>>'{rental,version}' is distinct from '1' or coalesce(new.recurring#>>'{rental,payment}','') not in ('full','partial','advance_months','cycle') then raise exception 'Invalid rental payment terms';end if;
  if coalesce(new.recurring#>>'{rental,advance_months}','') !~ '^[0-9]+$' or (new.recurring#>>'{rental,advance_months}')::int not between 1 and 1200 then raise exception 'Invalid advance months';end if;
  for period in select unnest(array['deposit','bw_rate','color_rate']) loop
   if coalesce(new.recurring->'rental'->>period,'') !~ '^[0-9]+([.][0-9]+)?$' or (new.recurring->'rental'->>period)::numeric>=1e12 then raise exception 'Invalid rental amount';end if;
  end loop;
  if new.recurring#>>'{rental,payment}'='partial' and (coalesce(new.recurring#>>'{rental,partial_amount}','') !~ '^[0-9]+([.][0-9]+)?$' or (new.recurring#>>'{rental,partial_amount}')::numeric<=0 or (new.recurring#>>'{rental,partial_amount}')::numeric>=1e12) then raise exception 'Invalid partial rental amount';end if;
  if length(coalesce(new.recurring#>>'{rental,balance_terms}',''))>2000 then raise exception 'Invalid rental balance terms';end if;
  if new.recurring->'rental' ? 'deposit_enabled' then
   if jsonb_typeof(new.recurring#>'{rental,deposit_enabled}')<>'boolean' then raise exception 'Invalid deposit switch';end if;
   if new.recurring#>>'{rental,deposit_enabled}'='false' then new.recurring:=jsonb_set(new.recurring,'{rental,deposit}','0');end if;
  end if;
  if length(coalesce(new.recurring#>>'{rental,deposit_terms}',''))>2000 or coalesce(new.recurring#>>'{rental,usage_enabled}','') not in ('true','false') then raise exception 'Invalid rental terms';end if;
  if new.recurring#>>'{rental,payment}'='advance_months' and exists(select 1 from jsonb_array_elements(clean) i where i->>'billing_period'<>'month' or (i->>'cycle_count')::int<(new.recurring#>>'{rental,advance_months}')::int) then raise exception 'Advance months require monthly lines within contract';end if;
  if exists(select 1 from jsonb_array_elements(clean) i where i->>'billing_period'='once') and new.recurring#>>'{rental,payment}' not in ('full','partial') then raise exception 'Lump sum requires full or partial upfront payment';end if;
 end if;
 new.items:=clean;return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_quote_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item jsonb;cycles integer:=1;q numeric;factor numeric;p numeric;d numeric;c numeric;line_net numeric;line_cost numeric;
  line_gp numeric;line_margin numeric;sub numeric:=0;line_disc numeric:=0;total_cost numeric:=0;
  actual_gp numeric:=0;actual_margin numeric:=0;doc_disc numeric:=0;net_before_tax numeric:=0;
  price_id uuid;source_vat text;has_exempt boolean:=false;has_taxable boolean:=false;clean jsonb:='[]'::jsonb;financial_lines jsonb:='[]'::jsonb;can_financial boolean:=false;
begin
  if TG_OP='UPDATE'
     and (to_jsonb(new)-array['updated_at','status','approval_status','approval_comment'])
         is not distinct from (to_jsonb(old)-array['updated_at','status','approval_status','approval_comment'])
  then return new; end if;

  if TG_OP='UPDATE'
     and new.quotation_kind is not distinct from old.quotation_kind
     and new.recurring is not distinct from old.recurring
     and new.items is not distinct from old.items
     and new.tax_rate is not distinct from old.tax_rate
     and new.wht_rate is not distinct from old.wht_rate
     and new.document_discount is not distinct from old.document_discount
     and new.subtotal is not distinct from old.subtotal
     and new.discount is not distinct from old.discount
     and new.vat is not distinct from old.vat
     and new.total is not distinct from old.total
     and new.withholding_tax is not distinct from old.withholding_tax
     and new.net_total is not distinct from old.net_total
  then return new; end if;

  if new.items is null or jsonb_typeof(new.items)<>'array' then raise exception 'Invalid quotation items'; end if;
  if jsonb_array_length(new.items) not between 1 and 500 then raise exception 'Quotation requires 1 to 500 items'; end if;
  if new.tax_rate is null or new.wht_rate is null or new.tax_rate not between 0 and 100 or new.wht_rate not between 0 and 100 then
    raise exception 'Invalid VAT or WHT rate';
  end if;

  can_financial:=coalesce(private.crm_can('quotations','approve'),false);
  doc_disc:=coalesce(new.document_discount,0);
  if doc_disc<0 or doc_disc>=1e12 or doc_disc='NaN'::numeric then raise exception 'Invalid document discount'; end if;

  for item in select * from jsonb_array_elements(new.items) loop
    cycles:=case when new.quotation_kind='recurring' then (item->>'cycle_count')::integer else 1 end;
    q:=(item->>'qty')::numeric;p:=(item->>'price')::numeric;d:=coalesce((item->>'discount')::numeric,0);
    factor:=case when item->>'billing_period'='once' then 1 else q*cycles end;
    price_id:=null;c:=null;source_vat:=null;
    if coalesce(item->>'price_item_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      price_id:=(item->>'price_item_id')::uuid;
    end if;
    if price_id is not null then
      select pi.cost,pi.account360_vat_mode into c,source_vat from public.crm_price_items pi where pi.id=price_id and pi.status='active';
      if source_vat='inclusive' then if new.tax_rate<=0 then raise exception 'VAT-inclusive product requires a positive VAT rate'; end if; c:=round(c/(1+new.tax_rate/100),2); end if;
      if source_vat='exempt' then has_exempt:=true; if new.tax_rate<>0 then raise exception 'VAT-exempt product requires zero VAT'; end if; else has_taxable:=true; end if;
      if c is null then raise exception 'Price Book item is unavailable'; end if;
    elsif not can_financial and item->>'billing_period' is distinct from 'once' then
      raise exception 'Price Book item is required for this quotation';
    else
      c:=coalesce((item->>'cost')::numeric,0);
    end if;

    if item->>'billing_period'='once' then
      c:=coalesce((item->>'cost')::numeric,(select (f.line_financials->jsonb_array_length(clean)->>'cost_total')::numeric from public.crm_quotation_financials f where f.quotation_id=new.id),0);
    end if;
    if length(trim(coalesce(item->>'name','')))=0 or q is null or p is null or q<=0 or p<0 or d<0 or c<0 or d>factor*p
       or q>=1e12 or p>=1e12 or d>=1e12 or c>=1e12
       or q='NaN'::numeric or p='NaN'::numeric or d='NaN'::numeric or c='NaN'::numeric
    then raise exception 'Invalid quotation quantity, price, discount or cost'; end if;

    d:=round(d,2);line_net:=round(round(factor*p,2)-d,2);line_cost:=round(factor*c,2);line_gp:=round(line_net-line_cost,2);
    line_margin:=case when line_net=0 then 0 else round(line_gp/line_net*100,2) end;
    financial_lines:=financial_lines||jsonb_build_array(jsonb_build_object('cost_total',line_cost,'gp',line_gp,'margin',line_margin,'net',line_net));
    sub:=sub+round(factor*p,2);line_disc:=line_disc+d;total_cost:=total_cost+line_cost;
    
 if price_id is not null and nullif(item->>'part_number','') is null then
  item:=item||jsonb_build_object('part_number',coalesce((select p.product_details->>'part_number' from public.crm_price_items p where p.id=price_id),''));
 end if;
 clean:=clean||jsonb_build_array((item-'cost'-'gp'-'margin')||jsonb_build_object('total',line_net,'discount',d));
  end loop;

  if has_exempt and has_taxable then raise exception 'Quote VAT-exempt and taxable products separately'; end if;
  new.items:=clean;new.subtotal:=round(sub,2);line_disc:=round(line_disc,2);
  if doc_disc>new.subtotal-line_disc then raise exception 'Document discount exceeds quotation value'; end if;
  new.document_discount:=round(doc_disc,2);new.discount:=round(line_disc+new.document_discount,2);
  net_before_tax:=round(new.subtotal-new.discount,2);new.vat:=round(net_before_tax*new.tax_rate/100,2);
  new.total:=round(net_before_tax+new.vat,2);new.withholding_tax:=round(net_before_tax*new.wht_rate/100,2);
  new.net_total:=round(new.total-new.withholding_tax,2);
  if new.recurring#>>'{rental,payment}'='partial' and round((new.recurring#>>'{rental,partial_amount}')::numeric,2)>new.net_total then raise exception 'Partial payment exceeds net rental';end if;
  actual_gp:=round(net_before_tax-total_cost,2);
  actual_margin:=case when net_before_tax=0 then 0 else round(actual_gp/net_before_tax*100,2) end;

  insert into public.crm_quotation_financials(quotation_id,cost_total,gp_amount,gp_margin,updated_at,line_financials)
  values(new.id,round(total_cost,2),actual_gp,actual_margin,clock_timestamp(),financial_lines)
  on conflict(quotation_id) do update
  set cost_total=excluded.cost_total,gp_amount=excluded.gp_amount,gp_margin=excluded.gp_margin,updated_at=excluded.updated_at,line_financials=excluded.line_financials;

  new.gp_amount:=0;
  new.gp_margin:=0;
  return new;
end
$function$
;
revoke all on function private.crm_quote_recurring_guard() from public,anon,authenticated;
revoke all on function private.crm_quote_totals() from public,anon,authenticated;

