-- Inventory editors must read the cost they are authorized to maintain.
create or replace function private.crm_price_catalog_secure()
returns table(id uuid,name text,code text,category text,unit text,price numeric,cost numeric,description text,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (private.crm_can('quotations','view') or private.crm_can('inventory','view')) then
  raise insufficient_privilege using message='Quotation or inventory view permission required';
 end if;
 return query select p.id,p.name,p.code,p.category,p.unit,p.price,
 case when private.crm_can('quotations','approve') or private.crm_can('inventory','edit') then p.cost else null end,
 p.description,p.status,p.created_at,p.updated_at from public.crm_price_items p order by p.code,p.name;
end $$;
revoke all on function private.crm_price_catalog_secure() from public,anon;
grant execute on function private.crm_price_catalog_secure() to authenticated;
