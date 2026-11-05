begin;
do $$ declare actor uuid;r public.crm_approval_policies;before_doc jsonb;after_doc jsonb;sid uuid;begin
 select id into actor from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.crm_approval_policies(name,minimum_amount,approver_ids,is_active,request_type) values('QA delete policy',0,array[actor],false,'so') returning * into r;
 select sales_order_id into sid from public.crm_so_approvals where status='approved' limit 1;
 if sid is null then raise exception 'Approved SO test fixture required';end if;
 update public.crm_so_approvals set approval_policy_id=r.id where sales_order_id=sid;
 select to_jsonb(a) into before_doc from public.crm_so_approvals a where sales_order_id=sid;
 begin perform public.crm_archive_approval_flow(r.id,r.updated_at-interval '1 second');raise exception 'Stale delete accepted';exception when others then if sqlerrm not like 'Approval flow changed%' then raise;end if;end;
 perform public.crm_archive_approval_flow(r.id,r.updated_at);
 if exists(select 1 from public.crm_approval_policies where id=r.id) then raise exception 'Policy remains in database';end if;
 select to_jsonb(a) into after_doc from public.crm_so_approvals a where sales_order_id=sid;
 if after_doc->>'approval_policy_id' is not null or (before_doc-'approval_policy_id') is distinct from (after_doc-'approval_policy_id') then raise exception 'Request history or approval changed';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.crm_archive_approval_flow(gen_random_uuid(),now());raise exception 'Anonymous delete allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
