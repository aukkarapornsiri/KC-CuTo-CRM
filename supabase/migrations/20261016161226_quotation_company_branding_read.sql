create or replace function private.crm_quotation_company()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.crm_can('quotations','view') then raise exception 'Quotation view permission required' using errcode='42501'; end if;
 select jsonb_build_object('company_name',c.company_name,'company_name_en',c.company_name_en,'logo_url',c.logo_url,'phone',c.phone,'email',c.email,'tax_id',c.tax_id,
 'company_details',jsonb_build_object('address_th',c.company_details->>'address_th','address_en',c.company_details->>'address_en','sales_name',c.company_details->>'sales_name','sales_phone',c.company_details->>'sales_phone','sales_email',c.company_details->>'sales_email','sales_line',c.company_details->>'sales_line','line',c.company_details->>'line'))
 into result from public.company_settings c where id=1;
 return result;
end; $$;
revoke all on function private.crm_quotation_company() from public,anon;
grant execute on function private.crm_quotation_company() to authenticated;
create or replace function public.crm_quotation_company()
returns jsonb language sql security invoker set search_path='' as $$ select private.crm_quotation_company(); $$;
revoke all on function public.crm_quotation_company() from public,anon;
grant execute on function public.crm_quotation_company() to authenticated;
