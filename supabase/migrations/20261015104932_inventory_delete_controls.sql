-- Narrow delete endpoint: no grants to delete ledger rows or change permissions.
create or replace function private.crm_inventory_delete_record(p_kind text,p_id uuid,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v jsonb; m public.master_data_items;
begin
 if auth.uid() is null or not private.crm_can('inventory','delete') then raise exception 'Inventory delete permission required' using errcode='42501'; end if;
 perform 1 from public.crm_inventory_settings where id for update;
 if p_kind='warehouse' then
  select to_jsonb(w) into v from public.crm_warehouses w where id=p_id for update;
 elsif p_kind='level' then
  select to_jsonb(l) into v from public.crm_stock_levels l where id=p_id for update;
 elsif p_kind='master' then
  select * into m from public.master_data_items where id=p_id for update;
  if found then v:=to_jsonb(m); end if;
  if m.category not in ('product_type','product_kind','product_category','unit','asset_brand') then raise exception 'Unsupported inventory master category' using errcode='42501'; end if;
 else raise exception 'Unsupported delete action';
 end if;
 if v is null then raise exception 'Record not found. Reload before deleting.'; end if;
 if p_expected is null or v is distinct from p_expected then raise exception 'Record changed. Reload before deleting.'; end if;
 if p_kind='warehouse' then
  delete from public.crm_warehouses where id=p_id;
 elsif p_kind='level' then
  delete from public.crm_stock_levels where id=p_id;
 else
  if exists(select 1 from public.crm_price_items p where (m.category='unit' and p.unit=m.name_th) or (m.category='product_category' and p.category=m.name_th))
   or exists(select 1 from public.crm_item_details d where (m.category='product_type' and d.product_type=m.name_th) or (m.category='product_kind' and d.product_kind=m.name_th) or (m.category='asset_brand' and d.brand=m.name_th))
  then raise exception 'รายการนี้ถูกใช้งานในสินค้า กรุณาปิดใช้งานแทน / Master is used by products. Deactivate it instead.'; end if;
  delete from public.master_data_items where id=p_id;
 end if;
 insert into public.audit_logs(user_id,action,module,category,changes,before_state,after_state) values(auth.uid(),'delete','inventory','admin_activity',jsonb_build_object('kind',p_kind,'id',p_id),v,null);
exception when foreign_key_violation then
 raise exception 'รายการนี้มีข้อมูลอ้างอิง กรุณาปิดใช้งานแทน / Record is referenced. Deactivate it instead.' using errcode='23503';
end; $$;
revoke all on function private.crm_inventory_delete_record(text,uuid,jsonb) from public,anon;
grant execute on function private.crm_inventory_delete_record(text,uuid,jsonb) to authenticated;
create or replace function public.crm_inventory_delete_record(p_kind text,p_id uuid,p_expected jsonb)
returns void language sql security invoker set search_path='' as $$ select private.crm_inventory_delete_record(p_kind,p_id,p_expected); $$;
revoke all on function public.crm_inventory_delete_record(text,uuid,jsonb) from public,anon;
grant execute on function public.crm_inventory_delete_record(text,uuid,jsonb) to authenticated;
