begin;
do $test$
declare actor uuid:=gen_random_uuid(); supervisor uuid; result jsonb; denied boolean:=false;
begin
select id into supervisor from public.profiles where is_super_admin and private.crm_active_user(id) limit 1;
perform set_config('request.jwt.claim.sub',supervisor::text,true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(actor,'authenticated','authenticated','qa-brand-'||actor||'@example.invalid','{"provider":"email","providers":["email"]}','{}');
insert into public.profiles(id,email,role,is_active,is_super_admin) values(actor,'qa-brand@example.invalid','sales_user',true,false);
insert into public.role_permissions(role_key,module,can_view) values('sales_user','quotations',true),('sales_user','settings',false) on conflict(role_key,module) do update set can_view=excluded.can_view;
perform set_config('request.jwt.claim.sub',actor::text,true);execute 'set local role authenticated';
if exists(select 1 from public.company_settings) then raise exception 'settings unexpectedly exposed';end if;
result:=public.crm_quotation_company();
if coalesce(length(result->>'logo_url'),0)=0 then raise exception 'company logo missing';end if;
if not exists(select 1 from public.crm_quotation_templates where is_default and status='active' and coalesce(logo_storage_key,logo_url)<>'') then raise exception 'decorative logo missing';end if;
if result ? 'id' or result ? 'updated_at' then raise exception 'excess settings fields exposed';end if;
execute 'reset role';perform set_config('request.jwt.claim.sub',supervisor::text,true);
update public.role_permissions set can_view=false where role_key='sales_user' and module='quotations';
perform set_config('request.jwt.claim.sub',actor::text,true);execute 'set local role authenticated';
begin perform public.crm_quotation_company();exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'unpermitted user accepted';end if;
execute 'reset role';
end $test$;
rollback;
select 'PASS: sales quotation branding without settings access; permission denial; no persistent changes' as result;
