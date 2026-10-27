-- Run inside a rollback-only transaction; never approve a real quotation.
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and is_active and deleted_at is null limit 1),true);
DO $$
declare u uuid:=auth.uid(); q uuid; r uuid; e public.crm_approval_events; k text;
begin
 select id into q from public.quotations limit 1;
 if u is null or q is null then raise exception 'Test requires an active admin and an existing quotation';end if;
 k:=u::text||'/seller-signature-regression-'||gen_random_uuid()::text||'.png';
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('crm-quotation-assets',k,u::text,'{"mimetype":"image/png","size":100}');
 insert into public.crm_approval_requests(quotation_id,submitted_by,approver_ids,current_step,status,snapshot) values(q,u,array[u],1,'approved','{}') returning id into r;
 insert into public.crm_sales_signature_defaults(user_id,storage_key) values(u,'') on conflict(user_id) do update set storage_key='';
 begin
  insert into public.crm_approval_events(request_id,actor_id,step,decision,comment) values(r,u,1,'approve','QA rollback');
  raise exception 'Missing signature was accepted';
 exception when others then if sqlerrm not like '%Save your signature in Profile%' then raise;end if;end;
 update public.crm_sales_signature_defaults set storage_key=k where user_id=u;
 insert into public.crm_approval_events(request_id,actor_id,step,decision,comment) values(r,u,1,'approve','QA rollback') returning * into e;
 if e.signature_storage_key is distinct from k or e.reviewer_name is null then raise exception 'Signature snapshot missing';end if;
 update public.crm_sales_signature_defaults set storage_key='' where user_id=u;
 update public.crm_approval_events set signature_storage_key='wrong' where id=e.id returning * into e;
 if e.signature_storage_key is distinct from k then raise exception 'Snapshot was overwritten';end if;
 begin
  insert into public.crm_approval_events(request_id,actor_id,step,decision,comment) values(r,u,2,'approve','QA rollback');
  raise exception 'Wrong approver step accepted';
 exception when insufficient_privilege then null;end;
end $$;
