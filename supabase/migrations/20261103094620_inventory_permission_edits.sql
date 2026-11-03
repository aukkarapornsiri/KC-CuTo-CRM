-- Authorized editors may correct all product metadata, including posted items.
create or replace function private.crm_inventory_save_item(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); v_old public.crm_price_items; v_details public.crm_item_details; v_code text; v_name text:=btrim(p->>'name'); v_unit text:=btrim(p->>'unit'); v_mode text:=coalesce(p->>'stock_mode','service'); v_serial boolean:=coalesce((p->>'track_serial')::boolean,false); v_price numeric:=(p->>'price')::numeric; v_cost numeric:=(p->>'cost')::numeric;
begin
 if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
 perform 1 from public.crm_inventory_settings where id for update;
 select * into v_old from public.crm_price_items where id=v_id for update;
 if not private.crm_can('inventory',case when v_old.id is null then 'create' else 'edit' end) then raise insufficient_privilege using message='Inventory permission denied'; end if;
 if v_old.id is not null and (p->>'updated_at')::timestamptz is distinct from v_old.updated_at then raise exception 'Record changed. Reload before saving.'; end if;
 if coalesce(length(v_name),0) not between 1 and 200 or coalesce(length(v_unit),0) not between 1 and 80 or v_price is null or v_cost is null or not(v_price>=0 and v_price<1000000000 and v_cost>=0 and v_cost<1000000000) then raise exception 'Name, unit and valid prices required'; end if;
 v_code:=upper(coalesce(nullif(btrim(p->>'code'),''),'ITEM-'||substr(replace(v_id::text,'-',''),1,12)));
 if v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,39}$' then raise exception 'Invalid item code'; end if;
 if exists(select 1 from public.crm_price_items where upper(code)=v_code and id<>v_id) then raise exception 'Duplicate item code'; end if;
 select * into v_details from public.crm_item_details where id=v_id;
 insert into public.crm_price_items(id,name,code,category,unit,price,cost,description,status) values(v_id,v_name,v_code,coalesce(p->>'category',''),v_unit,v_price,v_cost,coalesce(p->>'description',''),coalesce(p->>'status','active')) on conflict(id) do update set name=excluded.name,code=excluded.code,category=excluded.category,unit=excluded.unit,price=excluded.price,cost=excluded.cost,description=excluded.description,status=excluded.status,updated_at=clock_timestamp();
 insert into public.crm_item_details(id,stock_mode,product_type,product_kind,brand,part_number,barcode,vat_mode,subscription,contract_start,contract_end,track_serial,product_id,income_account,expense_account,inventory_account,asset_account,deferred_account)
 values(v_id,v_mode,coalesce(p->>'product_type',''),coalesce(p->>'product_kind',''),coalesce(p->>'brand',''),coalesce(p->>'part_number',''),coalesce(p->>'barcode',''),coalesce(p->>'vat_mode','exclusive'),coalesce(p->>'subscription',''),nullif(p->>'contract_start','')::date,nullif(p->>'contract_end','')::date,v_serial,nullif(p->>'product_id',''),coalesce(p->>'income_account',''),coalesce(p->>'expense_account',''),coalesce(p->>'inventory_account',''),coalesce(p->>'asset_account',''),coalesce(p->>'deferred_account',''))
 on conflict(id) do update set stock_mode=excluded.stock_mode,product_type=excluded.product_type,product_kind=excluded.product_kind,brand=excluded.brand,part_number=excluded.part_number,barcode=excluded.barcode,vat_mode=excluded.vat_mode,subscription=excluded.subscription,contract_start=excluded.contract_start,contract_end=excluded.contract_end,track_serial=excluded.track_serial,product_id=excluded.product_id,income_account=excluded.income_account,expense_account=excluded.expense_account,inventory_account=excluded.inventory_account,asset_account=excluded.asset_account,deferred_account=excluded.deferred_account;
 return v_id;
end $$;

-- Keep serialized inventory writes and optimistic concurrency; a unit change is
-- a 1:1 metadata correction, not a quantity conversion or a ledger rewrite.
create or replace function private.crm_inventory_price_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.crm_inventory_settings where id for update;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
revoke all on function private.crm_inventory_price_guard() from public,anon,authenticated;
revoke all on function private.crm_inventory_save_item(jsonb) from public,anon;
grant execute on function private.crm_inventory_save_item(jsonb) to authenticated;
