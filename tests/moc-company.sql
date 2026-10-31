-- All synthetic data and configuration writes are rolled back.
begin;
do $$ declare aid uuid; key text:='qa-'||gen_random_uuid()::text; result jsonb; n integer; begin
 select id into aid from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 if aid is null then raise exception 'Active admin fixture required';end if;
 update public.crm_company_data_settings set planned_provider='moc_open_data' where singleton;
 result:=public.crm_claim_moc_sync('0105550000015',key,aid);if result->>'status'<>'started' then raise exception 'Claim failed';end if;
 result:=public.crm_claim_moc_sync('0105550000015','qa-second-'||key,aid);if result->>'status'<>'busy' then raise exception 'Concurrent request not deduped';end if;
 perform public.crm_finish_moc_sync(key,null,'MOC_BLOCKED');
 result:=public.crm_claim_moc_sync('0105550000015','qa-third-'||key,aid);if result->>'status'<>'cooldown' then raise exception 'Blocked source not throttled';end if;
 select count(*) into n from public.crm_company_profiles where tax_id='0105550000015';if n<>0 then raise exception 'Blocked HTML created a profile';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',aid,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.crm_claim_moc_sync('0105550000015','qa-forbidden',aid);raise exception 'Client can invoke service-only sync';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
