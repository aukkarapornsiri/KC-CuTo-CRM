-- Additive configuration. Existing request snapshots and business documents are retained.
alter table public.crm_approval_policies add column request_type text not null default 'quotation' check(request_type in ('quotation','so','amendment'));
create function private.crm_flow_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.crm_active_user(p_user) and exists(select 1 from public.profiles p left join public.role_permissions r on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module='quotations' where p.id=p_user and (p.is_super_admin or (coalesce(r.can_view,false) and coalesce(r.can_approve,false))))
$$;
revoke all on function private.crm_flow_eligible(uuid) from public,anon,authenticated;
create function private.crm_flow_approvers() returns table(id uuid,display_name text,email text,role_key text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 return query select p.id,p.display_name,p.email,case when p.role='custom' then p.custom_role_key else p.role end from public.profiles p where private.crm_flow_eligible(p.id) order by p.display_name,p.email;
end $$;
revoke all on function private.crm_flow_approvers() from public,anon;
grant execute on function private.crm_flow_approvers() to authenticated;
create function public.crm_flow_approvers() returns table(id uuid,display_name text,email text,role_key text) language sql security invoker set search_path='' as $$select * from private.crm_flow_approvers()$$;
revoke all on function public.crm_flow_approvers() from public,anon;
grant execute on function public.crm_flow_approvers() to authenticated;
create or replace function private.crm_policy_validate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 if cardinality(new.approver_ids) not between 1 and 8 or cardinality(new.approver_ids)<>(select count(distinct x) from unnest(new.approver_ids) x) then raise exception 'Select 1–8 distinct approvers in order';end if;
 if exists(select 1 from unnest(new.approver_ids) x where not private.crm_flow_eligible(x)) then raise exception 'Every approver must be active and have approval permission';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.crm_policy_validate() from public,anon,authenticated;
-- Quotation policy selection remains amount-based, scoped to its document type.
do $$declare source text;begin
 select pg_get_functiondef('private.crm_approval_transition(uuid,text,text)'::regprocedure) into source;
 if position('WHERE is_active AND minimum_amount<=q.total' in source)=0 then raise exception 'Unexpected quotation transition definition';end if;
 source:=replace(source,'WHERE is_active AND minimum_amount<=q.total','WHERE request_type=''quotation'' AND is_active AND minimum_amount<=q.total');
 execute source;
end $$;
-- Reuse the deployed routing/history/signature implementation; only scope policy lookup.
do $$declare source text;begin
 select pg_get_functiondef('private.crm_so_configured_policy()'::regprocedure) into source;
 if position('where is_active and minimum_amount<=s.total' in source)=0 then raise exception 'Unexpected SO policy routing definition';end if;
 source:=replace(source,'where is_active and minimum_amount<=s.total','where request_type=case when tg_table_name=''crm_so_approvals'' then ''so'' else ''amendment'' end and is_active and minimum_amount<=s.total');
 execute source;
end $$;
notify pgrst,'reload schema';
