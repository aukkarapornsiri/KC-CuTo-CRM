-- Shared item form rules; no historical product rows are rewritten.
create table public.crm_item_field_rules(
 id integer primary key check(id=1),rules jsonb not null,version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
insert into public.crm_item_field_rules(id,rules) values(1,'["unit","price","cost"]');
alter table public.crm_item_field_rules enable row level security;
grant select,update on public.crm_item_field_rules to authenticated;
create policy item_field_rules_read on public.crm_item_field_rules for select to authenticated using(private.crm_active_user() and (private.crm_can('inventory','view') or private.crm_can('inventory','create') or private.crm_can('inventory','edit') or private.crm_can('inventory','manage_settings')));
create policy item_field_rules_update on public.crm_item_field_rules for update to authenticated using(private.crm_can('inventory','manage_settings')) with check(private.crm_can('inventory','manage_settings'));
create table public.crm_item_field_rule_history(id bigint generated always as identity primary key,version integer not null,rules jsonb not null,changed_at timestamptz not null default now(),changed_by uuid references public.profiles(id));
alter table public.crm_item_field_rule_history enable row level security;
grant select on public.crm_item_field_rule_history to authenticated;
create policy item_field_history_read on public.crm_item_field_rule_history for select to authenticated using(private.crm_can('inventory','manage_settings'));
create function private.crm_validate_item_field_rules() returns trigger language plpgsql security definer set search_path='' as $$
declare field text;allowed text[]:=array['unit','product_type','product_kind','category','brand','part_number','barcode','price','cost','subscription','contract_start','contract_end','product_id','income_account','expense_account','inventory_account','asset_account','deferred_account','description'];
begin
 if auth.uid() is null or not private.crm_can('inventory','manage_settings') then raise insufficient_privilege;end if;
 if new.id<>old.id or new.version<>old.version+1 then raise exception 'Invalid settings version';end if;
 if jsonb_typeof(new.rules)<>'array' then raise exception 'Invalid item rules';end if;
 for field in select jsonb_array_elements_text(new.rules) loop
  if field is null or not(field=any(allowed)) then raise exception 'Unsupported required field: %',field;end if;
 end loop;
 if (select count(*) from jsonb_array_elements_text(new.rules))<>(select count(distinct x) from jsonb_array_elements_text(new.rules) x) then raise exception 'Duplicate required fields';end if;
 new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();
 insert into public.crm_item_field_rule_history(version,rules,changed_by) values(new.version,new.rules,auth.uid());
 return new;
end $$;
revoke all on function private.crm_validate_item_field_rules() from public,anon,authenticated;
create trigger crm_item_field_rules_validate before update on public.crm_item_field_rules for each row execute function private.crm_validate_item_field_rules();
-- Authorized editors may correct all product metadata, including posted items.
create or replace function private.crm_inventory_save_item(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); v_old public.crm_price_items; v_details public.crm_item_details; v_code text; v_name text:=btrim(p->>'name'); v_unit text:=btrim(coalesce(p->>'unit','')); v_mode text:=coalesce(p->>'stock_mode','service'); v_serial boolean:=coalesce((p->>'track_serial')::boolean,false); v_price numeric:=coalesce(nullif(p->>'price','')::numeric,0); v_cost numeric:=coalesce(nullif(p->>'cost','')::numeric,0); v_rules jsonb; v_field text;
begin
 if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
 perform 1 from public.crm_inventory_settings where id for update;
 select * into v_old from public.crm_price_items where id=v_id for update;
 if not private.crm_can('inventory',case when v_old.id is null then 'create' else 'edit' end) then raise insufficient_privilege using message='Inventory permission denied'; end if;
 if v_old.id is not null and (p->>'updated_at')::timestamptz is distinct from v_old.updated_at then raise exception 'Record changed. Reload before saving.'; end if;
 select rules into strict v_rules from public.crm_item_field_rules where id=1 for share;
 for v_field in select jsonb_array_elements_text(v_rules) loop
  if coalesce(btrim(p->>v_field),'')='' then raise exception using errcode='23514',message='Required item field / กรุณากรอกข้อมูล: '||v_field;end if;
 end loop;
 if coalesce(length(v_name),0) not between 1 and 200 or length(v_unit)>80 or v_price is null or v_cost is null or not(v_price>=0 and v_price<1000000000 and v_cost>=0 and v_cost<1000000000) then raise exception 'Name, unit and valid prices required'; end if;
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


revoke all on function private.crm_inventory_save_item(jsonb) from public,anon;
grant execute on function private.crm_inventory_save_item(jsonb) to authenticated;
notify pgrst,'reload schema';
