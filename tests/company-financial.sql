-- Roll back every synthetic write. Never modify customer masters or live financial records.
begin;
do $$ declare n integer; aid uuid; begin
 if not public.crm_valid_juristic_id('0105550000015') or public.crm_valid_juristic_id('0000000000000') then raise exception 'Juristic ID validation failed'; end if;
 select id into aid from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 if aid is null then raise exception 'Active Super Admin required for transactional policy test'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',aid,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 update public.crm_company_data_settings set planned_provider='dbd_bdex' where singleton;
 get diagnostics n=row_count; if n<>1 then raise exception 'Admin configuration update failed'; end if;
 begin update public.crm_company_data_settings set automatic_sync=true;raise exception 'Unexpected activation';exception when insufficient_privilege then null;end;
 begin insert into public.crm_company_profiles(tax_id,company_name,source_provider,source_reference,source_as_of) values('0105550000015','Synthetic','qa','qa',current_date);raise exception 'Unexpected client financial write';exception when insufficient_privilege then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{}',true);execute 'set local role authenticated';
 update public.crm_company_data_settings set planned_provider='other_licensed' where singleton;
 get diagnostics n=row_count;if n<>0 then raise exception 'Unauthorized update';end if;
 select count(*) into n from public.crm_company_profiles;if n<>0 then raise exception 'Unauthorized read';end if;
 execute 'reset role';
end $$;
rollback;
