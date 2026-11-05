-- Preserve the existing catalog API and its financial/permission boundary.
create or replace function private.crm_price_catalog_with_parts()
returns setof jsonb language sql stable security definer set search_path=''
as $$
 select to_jsonb(c)||jsonb_build_object('part_number',coalesce(nullif(btrim(p.product_details->>'part_number'),''),''))
 from private.crm_price_catalog_secure() c
 join public.crm_price_items p on p.id=c.id;
$$;
revoke all on function private.crm_price_catalog_with_parts() from public,anon;
grant execute on function private.crm_price_catalog_with_parts() to authenticated;
create or replace function public.crm_price_catalog_v2()
returns setof jsonb language sql stable security invoker set search_path=''
as $$ select * from private.crm_price_catalog_with_parts(); $$;
revoke all on function public.crm_price_catalog_v2() from public,anon;
grant execute on function public.crm_price_catalog_v2() to authenticated;
notify pgrst,'reload schema';
