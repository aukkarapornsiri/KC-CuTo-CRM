-- Future SO openings only. Existing orders and orders arriving while disabled are excluded.
set local lock_timeout='2s';
set local statement_timeout='45s';
alter table public.crm_inventory_settings
 add column auto_issue_on_so boolean not null default false,
 add column so_stock_enabled_at timestamptz;

create table public.crm_so_stock_orders (
 so_id uuid primary key references public.kc_dw_sales_order_facts(id),
 state text not null check(state in ('excluded','issued','reversed')),
 cycle integer not null default 0 check(cycle>=0),
 source_lines jsonb not null default '[]',
 stock_lines jsonb not null default '[]',
 updated_at timestamptz not null default now()
);
alter table public.crm_so_stock_orders enable row level security;
revoke all on public.crm_so_stock_orders from public,anon,authenticated;
grant select on public.crm_so_stock_orders to authenticated;
create policy crm_so_stock_read on public.crm_so_stock_orders for select to authenticated
 using ((select private.crm_active_user()) and (select private.crm_can('inventory','view')));
insert into public.crm_so_stock_orders(so_id,state) select id,'excluded' from public.kc_dw_sales_order_facts;

-- Automated history identifies its source document, without impersonating a person.
alter table public.crm_stock_movements alter column created_by drop not null;
alter table public.crm_stock_movements add column source_so_id uuid references public.kc_dw_sales_order_facts(id),
 add column source_so_cycle integer, add column source_so_line integer;
alter table public.crm_stock_movements add constraint crm_stock_actor_or_so check (
 (source_so_id is null and created_by is not null and source_so_cycle is null and source_so_line is null)
 or (source_so_id is not null and created_by is null and source_so_cycle is not null and source_so_cycle>0 and source_so_line is not null and source_so_line>0
     and service_part_id is null and kind in ('issue','receipt') and to_warehouse_id is null));
create unique index crm_stock_so_once on public.crm_stock_movements(source_so_id,source_so_cycle,kind,source_so_line)
 where source_so_id is not null;

create function private.crm_so_stock_settings_guard() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 -- The activation instant is server-owned. Turning off never cancels reversals already owed.
 new.so_stock_enabled_at:=old.so_stock_enabled_at;
 if new.auto_issue_on_so and (not old.auto_issue_on_so or new.enabled is distinct from old.enabled or new.default_warehouse_id is distinct from old.default_warehouse_id) then
  if not new.enabled or not exists(select 1 from public.crm_warehouses where id=new.default_warehouse_id and active)
   or not exists(select 1 from public.crm_item_details d join public.crm_price_items p on p.id=d.id where d.stock_mode='stock' and p.status='active')
   or not exists(select 1 from public.crm_stock_balances b join public.crm_item_details d on d.id=b.item_id join public.crm_warehouses w on w.id=b.warehouse_id where b.quantity>0 and d.stock_mode='stock' and w.active)
  then raise exception 'SO stock setup requires enabled stock control, an active default warehouse, stock items and opening balances'; end if;
  if not old.auto_issue_on_so then new.so_stock_enabled_at:=clock_timestamp(); end if;
 end if;
 return new;
end $$;
revoke all on function private.crm_so_stock_settings_guard() from public,anon,authenticated,service_role;
create trigger crm_so_stock_settings_guard before update on public.crm_inventory_settings
 for each row execute function private.crm_so_stock_settings_guard();

-- Ignore changes to display names and revenue; stock identity and quantity remain immutable after issue.
create function private.crm_so_stock_identity(p jsonb) returns jsonb
 language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','quantity',x->'quantity',
 'warehouse_id',x->>'warehouse_id','serial_number',coalesce(x->>'serial_number','')) order by n),'[]'::jsonb)
 from jsonb_array_elements(p) with ordinality e(x,n)
$$;
revoke all on function private.crm_so_stock_identity(jsonb) from public,anon,authenticated,service_role;

create function private.crm_so_stock_on_change() returns trigger
 language plpgsql security definer set search_path='' as $$
declare
 cfg public.crm_inventory_settings; run public.crm_so_stock_orders;
 line jsonb; item record; stock jsonb:='[]'; identity jsonb; entry jsonb;
 wh uuid; qty numeric; sn text; balance numeric; delta numeric; line_no integer:=0;
 movement_kind text; next_state text; next_cycle integer;
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
 identity:=private.crm_so_stock_identity(new.product_lines);
 if run.state in ('issued','reversed') and new.status='converted' and identity is distinct from run.source_lines then
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
  if run.state='reversed' then stock:=run.stock_lines; end if;
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
 on conflict(so_id) do update set state=excluded.state,cycle=excluded.cycle,updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function private.crm_so_stock_on_change() from public,anon,authenticated,service_role;
create trigger crm_so_stock_on_change after insert or update on public.kc_dw_sales_order_facts
 for each row execute function private.crm_so_stock_on_change();
