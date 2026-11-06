-- Run on a test database with a provisioned active Super Admin. Always rolls back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_super_admin and is_active and deleted_at is null limit 1),true);
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.crm_create_customer_with_contact(jsonb_build_object('name','QA rollback tax ID test','tax_id','0105541063051','status','Active','owner_id',auth.uid()),'{"first_name":"QA","last_name":"Rollback"}'::jsonb);
 if r->>'tax_id' is distinct from '0105541063051' then raise exception 'Tax ID must preserve leading zero';end if;
 if (select count(*) from public.contacts where customer_id=(r->>'id')::uuid and is_primary)<>1 then raise exception 'Primary contact missing';end if;
end $$;
rollback;
