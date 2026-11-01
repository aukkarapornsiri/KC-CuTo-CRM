create or replace function private.crm_import_company_statement(p_customer_id uuid,p_statement jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tax text; v jsonb:=p_statement;
begin
 if not private.crm_is_super_admin() then raise exception 'ACCESS_DENIED';end if;
 select regexp_replace(tax_id,'[[:space:]-]','','g') into tax from public.customers where id=p_customer_id;
 if tax is null or not public.crm_valid_juristic_id(tax) or tax is distinct from v->>'tax_id' then raise exception 'TAX_ID_MISMATCH';end if;
 if not exists(select 1 from public.crm_company_profiles where tax_id=tax) and coalesce(v->>'company_name','')='' then raise exception 'COMPANY_PROFILE_REQUIRED';end if;
 if (v->>'source_as_of')::date>current_date or coalesce(v->>'source_reference','') !~ '^https://' or length(v->>'source_reference')>500 or coalesce(v->>'source_provider','')='' then raise exception 'PROVENANCE_REQUIRED';end if;
 if (v->>'period_end')::date>current_date or extract(year from (v->>'period_end')::date)<>(v->>'fiscal_year')::int then raise exception 'INVALID_PERIOD';end if;
 insert into public.crm_company_profiles(tax_id,company_name,source_provider,source_reference,source_as_of) values(tax,coalesce(nullif(v->>'company_name',''),(select company_name from public.crm_company_profiles where tax_id=tax)),v->>'source_provider',v->>'source_reference',(v->>'source_as_of')::date) on conflict(tax_id) do nothing;
 insert into public.crm_company_financial_statements(tax_id,fiscal_year,statement_scope,period_start,period_end,revenue,expenses,net_profit,assets,liabilities,equity,source_provider,source_reference,source_as_of)
 values(tax,(v->>'fiscal_year')::int,v->>'statement_scope',(v->>'period_start')::date,(v->>'period_end')::date,(v->>'revenue')::numeric,(v->>'expenses')::numeric,(v->>'net_profit')::numeric,(v->>'assets')::numeric,(v->>'liabilities')::numeric,(v->>'equity')::numeric,v->>'source_provider',v->>'source_reference',(v->>'source_as_of')::date)
 on conflict(tax_id,fiscal_year,statement_scope) do update set period_start=excluded.period_start,period_end=excluded.period_end,revenue=excluded.revenue,expenses=excluded.expenses,net_profit=excluded.net_profit,assets=excluded.assets,liabilities=excluded.liabilities,equity=excluded.equity,source_provider=excluded.source_provider,source_reference=excluded.source_reference,source_as_of=excluded.source_as_of,fetched_at=clock_timestamp();
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'update','customers',p_customer_id,jsonb_build_object('type','annual_statement','fiscal_year',v->>'fiscal_year','tax_id',tax,'source',v->>'source_reference'));
end $$;

