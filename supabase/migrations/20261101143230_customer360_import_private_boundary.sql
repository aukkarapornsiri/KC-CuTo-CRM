alter function public.crm_import_company_statement(uuid,jsonb) set schema private;
create function public.crm_import_company_statement(p_customer_id uuid,p_statement jsonb) returns void language sql security invoker set search_path='' as $$select private.crm_import_company_statement(p_customer_id,p_statement)$$;
revoke all on function public.crm_import_company_statement(uuid,jsonb) from public,anon;
grant execute on function public.crm_import_company_statement(uuid,jsonb) to authenticated;
