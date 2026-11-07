-- All fixtures, role changes, audit entries and notices are rolled back.
begin;
do $$
declare u uuid;v uuid;w uuid;c uuid;q public.quotations;p public.crm_approval_policies;r jsonb;again jsonb;threshold numeric;price numeric;cost numeric;expected boolean;before_count bigint;old_request uuid;
begin
 select id into u from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 select id into v from public.profiles where id<>u and is_active and deleted_at is null order by id limit 1;
 select id into w from public.profiles where id not in(u,v) and is_active and deleted_at is null order by id limit 1;
 if u is null or v is null or w is null then raise exception 'Three active fixture accounts required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.custom_roles(role_key,label_th,label_en) values('qa_gp_review','QA GP','QA GP');
 insert into public.role_permissions(role_key,module,can_view,can_create,can_edit,can_approve,can_assign) values('qa_gp_review','quotations',true,true,true,true,true);
 update public.profiles set role='custom',custom_role_key='qa_gp_review' where id in(v,w);
 update public.crm_approval_policies set is_active=false where request_type='quotation';
 insert into public.crm_approval_policies(name,request_type,minimum_amount,approver_ids,is_active,low_gp_threshold,low_gp_amount,low_gp_approver_ids)
 values('QA low GP condition','quotation',0,array[v],true,null,20,array[w]) returning * into p;
 insert into public.customers(name,owner_id) values('QA low GP rollback',u) returning id into c;
 execute 'set local role authenticated';
 -- Above, equal and below the threshold; a free item with cost must lower GP.
 for price,cost,expected in values (100,70,false),(100,80,false),(100,81,true),(100,110,true),(0,5,true) loop
  insert into public.quotations(customer_id,owner_id,status,items,tax_rate,wht_rate,document_discount)
   values(c,u,'draft',jsonb_build_array(jsonb_build_object('name','QA GP line','qty',1,'price',price,'cost',cost)),7,0,0) returning * into q;
  select count(*) into before_count from public.crm_approval_requests where quotation_id=q.id;
  r:=public.crm_quotation_transition(q.id,'submit','QA GP');
  if (r->'snapshot'->'approval_conditions'->>'low_gp_applied')::boolean is distinct from expected
   or jsonb_array_length(r->'approver_ids')<>(case when expected then 2 else 1 end) then raise exception 'Wrong GP route for price % cost %: %',price,cost,r;end if;
  if (r->'approver_ids'->>0)::uuid<>v or expected and (r->'approver_ids'->>1)::uuid<>w then raise exception 'Wrong reviewer order';end if;
  again:=public.crm_quotation_transition(q.id,'submit','Retry');
  if again->>'id'<>r->>'id' or (select count(*) from public.crm_approval_requests where quotation_id=q.id)<>before_count+1 then raise exception 'Duplicate request created';end if;
  if expected then old_request:=(r->>'id')::uuid;end if;
  perform public.crm_quotation_transition(q.id,'cancel','QA cleanup');
 end loop;

end $$;
rollback;

