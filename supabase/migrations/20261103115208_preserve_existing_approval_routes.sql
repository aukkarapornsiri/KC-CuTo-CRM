drop index public.crm_approval_threshold;
create unique index crm_approval_threshold on public.crm_approval_policies(request_type,minimum_amount) where is_active;
-- Preserve the Super Admin's existing amount-based routes as each type becomes independent.
-- Copy configuration only; do not change any request, decision, signature or document.
do $$declare actor uuid;before_actor text:=current_setting('request.jwt.claim.sub',true);begin
 select id into actor from public.profiles where is_super_admin and private.crm_active_user(id) order by id limit 1;
 if actor is null then raise exception 'Active Super Admin required to preserve approval routes';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.crm_approval_policies(name,minimum_amount,approver_ids,is_active,request_type)
 select p.name,p.minimum_amount,p.approver_ids,p.is_active,k.kind
 from (select distinct on(minimum_amount) * from public.crm_approval_policies where request_type='quotation' and is_active order by minimum_amount,id) p
 cross join (values('so'),('amendment')) k(kind)
 where not exists(select 1 from public.crm_approval_policies x where x.request_type=k.kind)
 and not exists(select 1 from unnest(p.approver_ids) x where not private.crm_flow_eligible(x));
 perform set_config('request.jwt.claim.sub',coalesce(before_actor,''),true);
end $$;
