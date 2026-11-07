begin;
do $$
declare u uuid;v uuid;w uuid;s public.crm_sales_orders;a public.crm_so_approvals;pid uuid;gp numeric;expected boolean;
begin
 select id into u from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 select p.id into v from public.profiles p where p.id<>u and private.crm_flow_eligible(p.id) order by p.id limit 1;
 select o.* into s from public.crm_sales_orders o where o.status='confirmed' and o.owner_id not in(u,v) and private.crm_active_user(o.owner_id) order by o.created_at desc limit 1;
 if s.id is null or v is null then raise exception 'Independent fixture actors required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 update public.crm_approval_policies set is_active=false where request_type='so';
 insert into public.crm_approval_policies(name,request_type,minimum_amount,approver_ids,is_active,low_gp_amount,low_gp_approver_ids)
 values('QA SO profit amount rollback','so',0,array[u],true,20,array[v]) returning id into pid;
 for gp,expected in values(30,false),(20,false),(19,true),(-1,true) loop
  perform set_config('request.jwt.claim.sub',u::text,true);
  delete from public.crm_so_approvals where sales_order_id=s.id;
  update public.crm_sales_order_cost_sheets set gp_amount=gp,cost_total=100-gp,gp_margin=gp where sales_order_id=s.id;
  perform set_config('request.jwt.claim.sub',s.owner_id::text,true);
  a:=public.crm_so_approval_action(s.id,'request','QA profit route');
  if cardinality(a.approver_ids)<>(case when expected then 2 else 1 end) or a.approver_ids[1]<>u or expected and a.approver_ids[2]<>v
   then raise exception 'SO profit amount route failed: GP %, route %',gp,a.approver_ids;end if;
 end loop;
 perform set_config('request.jwt.claim.sub',u::text,true);
 update public.crm_approval_policies set low_gp_amount=null,low_gp_threshold=20 where id=pid;
 -- Previously submitted SO retains the approved policy route even after configuration changes.
 if (select approver_ids from public.crm_so_approvals where sales_order_id=s.id)<>array[u,v] then raise exception 'Pending route changed';end if;
end $$;
rollback;
