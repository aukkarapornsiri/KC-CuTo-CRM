-- Apply before publishing the Recurring upfront-payment option. No existing records are changed.
create or replace function private.crm_quote_recurring_guard() returns trigger
language plpgsql set search_path='' as $$
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
  if coalesce(period,'') not in ('day','month','year') or coalesce(item->>'cycle_count','') !~ '^[0-9]+$' then raise exception 'Invalid billing period or cycles';end if;
  cycles:=(item->>'cycle_count')::integer;
  if cycles not between 1 and 36600 or coalesce(item->>'service_start','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid cycles or service start';end if;
  starts:=(item->>'service_start')::date;
  ends:=(starts+case period when 'day' then make_interval(days=>cycles) when 'month' then make_interval(months=>cycles) else make_interval(years=>cycles) end)::date-1;
  if starts<contract_start or ends>contract_end then raise exception 'Service period must be within the contract';end if;
  clean:=clean||jsonb_build_array(item||jsonb_build_object('cycle_count',cycles,'service_end',ends::text));
 end loop;
 new.items:=clean;return new;
end $$;
revoke all on function private.crm_quote_recurring_guard() from public,anon,authenticated;
