-- Use the very same active Finance snapshot as KC Digital Workplace annual-company.
-- No copying facts, no CRM SO addition, no changes to employee identity attribution.
create or replace function private.crm_dw_company_actual(p_month date)
returns numeric language plpgsql stable set search_path = '' as $$
declare snapshot public.kc_dw_finance_imports%rowtype; value jsonb; result numeric;
begin
 select * into snapshot from public.kc_dw_finance_imports
 where year=extract(year from p_month)::int and active;
 if not found then return null; end if;
 if snapshot.source->>'basis'='sum_values' then
  value := snapshot.source->'summary'->'so'->'monthly'->(extract(month from p_month)::int-1);
  if jsonb_typeof(value) is distinct from 'number' then return null; end if;
  return (value#>>'{}')::numeric;
 end if;
 -- Legacy Finance exports contain gross satang; DW divides by VAT once.
 select round(coalesce(sum((d->>'grossCents')::numeric),0)/1.07)/100 into result
 from jsonb_array_elements(snapshot.documents) d
 where d->>'kind'='SO' and left(d->>'date',7)=to_char(p_month,'YYYY-MM')
 and (d->>'date')::date <= (now() at time zone 'Asia/Bangkok')::date;
 return result;
end $$;
revoke all on function private.crm_dw_company_actual(date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.crm_get_sales_report(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.crm_sales_target_plans%rowtype;v_all boolean;v_admin boolean;v_people jsonb;v_employees jsonb;v_months jsonb;v_scope text;
begin
 if NOT (private.crm_can('reports','view') OR (private.crm_can('dashboard','view') AND EXISTS (SELECT 1 FROM public.profiles a JOIN public.dashboard_type_access d ON d.role_key=CASE WHEN a.role='custom' THEN a.custom_role_key ELSE a.role END WHERE a.id=auth.uid() AND d.dashboard_type='sales' AND d.visible))) OR auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_active and deleted_at is null) then raise exception 'Access denied' using errcode='42501';end if;
 if p_year is null or p_year not between 2000 and 2200 then raise exception 'Invalid plan year';end if;
 v_all:=true;v_admin:=private.crm_can('reports','manage_settings');
 select * into v_plan from public.crm_sales_target_plans where plan_year=p_year;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'active',p.is_active,'department_group',p.department_group) order by p.display_name,p.id),'[]'::jsonb) into v_people from public.profiles p where true and (p.is_active or exists(select 1 from public.crm_sales_employee_targets e where e.plan_id=v_plan.id and e.profile_id=p.id));
 select coalesce(jsonb_agg(jsonb_build_object('profile_id',e.profile_id,'name',p.display_name,'start_month',e.start_month,'end_month',e.end_month,'amount',e.amount) order by p.display_name,e.profile_id),'[]'::jsonb) into v_employees from public.crm_sales_employee_targets e join public.profiles p on p.id=e.profile_id where e.plan_id=v_plan.id and true;
 select coalesce(jsonb_agg(jsonb_build_object('month',m::date,
 'company_target',case when v_all then private.crm_target_month_amount(v_plan.company_target,v_plan.start_month,v_plan.end_month,m::date) else null end,
 'company_actual',case when v_all then private.crm_dw_company_actual(m::date) else null end,
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'target',case when e.profile_id is null then null else private.crm_target_month_amount(e.amount,e.start_month,e.end_month,m::date) end,
 'actual',(select coalesce(sum(f.net_amount),0) from public.kc_dw_sales_order_facts f where lower(f.sales_email)=lower(p.email) and f.period_month=m::date and f.status='converted' and f.currency='THB')) order by p.display_name,p.id),'[]'::jsonb)
 from public.profiles p left join public.crm_sales_employee_targets e on e.profile_id=p.id and e.plan_id=v_plan.id
 where true and (p.is_active or e.profile_id is not null))) order by m),'[]'::jsonb)
 into v_months from generate_series(v_plan.start_month::timestamp,v_plan.end_month::timestamp,interval '1 month') m;
 v_scope:=case when v_all then 'company' when exists(select 1 from jsonb_array_elements(v_people) p where p->>'id'<>auth.uid()::text) then 'team' else 'self' end;
 return jsonb_build_object('plan',case when v_plan.id is null then null else jsonb_build_object('id',v_plan.id,'plan_year',v_plan.plan_year,'start_month',v_plan.start_month,'end_month',v_plan.end_month,'company_target',case when v_all then v_plan.company_target else null end,'updated_at',v_plan.updated_at) end,
 'people',v_people,'employees',v_employees,'months',v_months,'scope',v_scope,'can_manage',v_admin,'can_link_sales',private.crm_can('reports','view'),'can_export',private.crm_can('reports','export'),'company_source',case when v_all then (select jsonb_build_object('system','KC Digital Workplace','name',s.source->>'name','updated_at',s.created_at) from public.kc_dw_finance_imports s where s.year=p_year and s.active) else null end,'company_basis','kc_digital_workplace_finance','basis','converted_so_net_thb','as_of',now());
end $function$;

CREATE OR REPLACE FUNCTION private.crm_get_sales_targets(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.crm_sales_target_plans%rowtype;v_all boolean;v_admin boolean;v_people jsonb;v_employees jsonb;v_months jsonb;v_scope text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_active) or not (private.crm_can('dashboard','view') or private.crm_can('reports','view') or private.crm_can('settings','view')) then raise exception 'Access denied' using errcode='42501';end if;
 if p_year is null or p_year not between 2000 and 2200 then raise exception 'Invalid plan year';end if;
 v_all:=private.crm_target_all_access();v_admin:=private.crm_is_admin();
 select * into v_plan from public.crm_sales_target_plans where plan_year=p_year;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'active',p.is_active,'department_group',p.department_group) order by p.display_name,p.id),'[]'::jsonb) into v_people from public.profiles p where private.crm_target_person_access(p.id) and (p.is_active or exists(select 1 from public.crm_sales_employee_targets e where e.plan_id=v_plan.id and e.profile_id=p.id));
 select coalesce(jsonb_agg(jsonb_build_object('profile_id',e.profile_id,'name',p.display_name,'start_month',e.start_month,'end_month',e.end_month,'amount',e.amount) order by p.display_name,e.profile_id),'[]'::jsonb) into v_employees from public.crm_sales_employee_targets e join public.profiles p on p.id=e.profile_id where e.plan_id=v_plan.id and private.crm_target_person_access(p.id);
 select coalesce(jsonb_agg(jsonb_build_object('month',m::date,
 'company_target',case when v_all then private.crm_target_month_amount(v_plan.company_target,v_plan.start_month,v_plan.end_month,m::date) else null end,
 'company_actual',case when v_all then private.crm_dw_company_actual(m::date) else null end,
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'target',case when e.profile_id is null then null else private.crm_target_month_amount(e.amount,e.start_month,e.end_month,m::date) end,
 'actual',(select coalesce(sum(f.net_amount),0) from public.kc_dw_sales_order_facts f where lower(f.sales_email)=lower(p.email) and f.period_month=m::date and f.status='converted' and f.currency='THB')) order by p.display_name,p.id),'[]'::jsonb)
 from public.profiles p left join public.crm_sales_employee_targets e on e.profile_id=p.id and e.plan_id=v_plan.id
 where private.crm_target_person_access(p.id) and (p.is_active or e.profile_id is not null))) order by m),'[]'::jsonb)
 into v_months from generate_series(v_plan.start_month::timestamp,v_plan.end_month::timestamp,interval '1 month') m;
 v_scope:=case when v_all then 'company' when exists(select 1 from jsonb_array_elements(v_people) p where p->>'id'<>auth.uid()::text) then 'team' else 'self' end;
 return jsonb_build_object('plan',case when v_plan.id is null then null else jsonb_build_object('id',v_plan.id,'plan_year',v_plan.plan_year,'start_month',v_plan.start_month,'end_month',v_plan.end_month,'company_target',case when v_all then v_plan.company_target else null end,'updated_at',v_plan.updated_at) end,
 'people',v_people,'employees',v_employees,'months',v_months,'scope',v_scope,'can_manage',v_admin,'can_export',private.crm_can('reports','export'),'company_source',case when v_all then (select jsonb_build_object('system','KC Digital Workplace','name',s.source->>'name','updated_at',s.created_at) from public.kc_dw_finance_imports s where s.year=p_year and s.active) else null end,'company_basis','kc_digital_workplace_finance','basis','converted_so_net_thb','as_of',now());
end $function$;

