-- Optional escalation inside the existing quotation request; no parallel request.
alter table public.crm_approval_policies
 add column low_gp_threshold numeric(6,2),
 add column low_gp_approver_ids uuid[] not null default '{}',
 add constraint crm_quotation_low_gp_condition check (
  (low_gp_threshold is null and cardinality(low_gp_approver_ids)=0)
  or (request_type='quotation' and low_gp_threshold is not null and low_gp_threshold between 0 and 100 and cardinality(low_gp_approver_ids) between 1 and 8)
 );

create function private.crm_quotation_gp_policy_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege;end if;
 if new.low_gp_threshold is not null then
  if exists(select 1 from unnest(new.low_gp_approver_ids) x where x is null or not coalesce(private.crm_flow_eligible(x),false))
   or cardinality(new.low_gp_approver_ids)<>(select count(distinct x) from unnest(new.low_gp_approver_ids) x)
   or exists(select 1 from unnest(new.low_gp_approver_ids) x where x=any(new.approver_ids))
   or cardinality(new.approver_ids)+cardinality(new.low_gp_approver_ids)>8
  then raise exception 'Select distinct eligible additional approvers; combined route cannot exceed 8 steps';end if;
 end if;
 return new;
end $$;
create trigger crm_quotation_gp_policy_guard before insert or update on public.crm_approval_policies for each row execute function private.crm_quotation_gp_policy_guard();

create function private.crm_quotation_gp_route() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.quotations;p public.crm_approval_policies;f public.crm_quotation_financials;low boolean;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into q from public.quotations where id=new.quotation_id;
 select * into p from public.crm_approval_policies where request_type='quotation' and is_active and deleted_at is null and minimum_amount<=q.total order by minimum_amount desc,id limit 1 for share;
 -- Disabled conditions preserve the original route and existing submissions.
 if p.id is null or p.low_gp_threshold is null then return new;end if;
 if new.approver_ids is distinct from p.approver_ids then raise exception 'Quotation approval route changed; submit again';end if;
 select * into f from public.crm_quotation_financials where quotation_id=q.id;
 if not found then raise exception 'Quotation financial summary is missing; save the quotation before submitting';end if;
 -- Zero/negative revenue has no meaningful margin denominator and must be reviewed.
 low:=f.gp_amount+f.cost_total<=0 or f.gp_margin<p.low_gp_threshold;
 if low then
  if new.submitted_by=any(p.low_gp_approver_ids) or q.owner_id=any(p.low_gp_approver_ids)
   then raise exception 'Requester and sales owner cannot approve a low GP quotation';end if;
  if exists(select 1 from unnest(p.low_gp_approver_ids) x where not coalesce(private.crm_flow_eligible(x),false))
   then raise exception 'A low GP approver is no longer eligible; contact Super Admin';end if;
  new.approver_ids:=new.approver_ids||p.low_gp_approver_ids;
 end if;
 -- Do not copy confidential GP amounts into the general quotation snapshot.
 new.snapshot:=new.snapshot||jsonb_build_object('approval_conditions',jsonb_build_object(
  'policy_id',p.id,'policy_name',p.name,'low_gp_applied',low,'low_gp_threshold',p.low_gp_threshold,
  'base_steps',cardinality(p.approver_ids),'additional_steps',case when low then cardinality(p.low_gp_approver_ids) else 0 end,
  'no_margin_base',f.gp_amount+f.cost_total<=0));
 return new;
end $$;
create trigger crm_quotation_gp_route before insert on public.crm_approval_requests for each row execute function private.crm_quotation_gp_route();
revoke all on function private.crm_quotation_gp_policy_guard(),private.crm_quotation_gp_route() from public,anon,authenticated;
notify pgrst,'reload schema';
