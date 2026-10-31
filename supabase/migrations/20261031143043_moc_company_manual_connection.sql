alter table public.crm_company_data_settings drop constraint crm_company_data_settings_planned_provider_check;
alter table public.crm_company_data_settings add constraint crm_company_data_settings_planned_provider_check check(planned_provider in ('unconfigured','dbd_bdex','other_licensed','moc_open_data'));
alter table public.crm_company_data_settings drop constraint crm_company_data_settings_connection_status_check;
alter table public.crm_company_data_settings add constraint crm_company_data_settings_connection_status_check check(connection_status in ('not_configured','moc_ready'));
alter table public.crm_company_profiles alter column source_as_of drop not null;
alter table public.crm_company_profiles add column company_name_en text,add column address jsonb not null default '{}'::jsonb;
create or replace function private.crm_stamp_company_settings() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();new.connection_status:=case when new.planned_provider='moc_open_data' then 'moc_ready' else 'not_configured' end;return new;end $$;
update public.crm_company_data_settings set planned_provider='moc_open_data' where singleton;
alter table public.crm_company_data_sync_logs add column initiated_by uuid references public.profiles(id);
create index crm_company_sync_actor_time on public.crm_company_data_sync_logs(initiated_by,started_at desc);
create function public.crm_claim_moc_sync(p_tax_id text,p_request_key text,p_actor_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare last_run public.crm_company_data_sync_logs;
begin
 if not public.crm_valid_juristic_id(p_tax_id) or length(p_request_key) not between 1 and 100 then raise exception 'INVALID_REQUEST';end if;
 if not exists(select 1 from public.crm_company_data_settings where singleton and planned_provider='moc_open_data') then raise exception 'MOC_DISABLED';end if;
 if p_actor_id is null then raise exception 'ACTOR_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('moc-actor:'||p_actor_id::text,0));
 if (select count(*) from public.crm_company_data_sync_logs where initiated_by=p_actor_id and started_at>now()-interval '1 minute')>=10 then return jsonb_build_object('status','rate_limited');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tax_id,0));
 if exists(select 1 from public.crm_company_profiles where tax_id=p_tax_id and source_provider='MOC Open Data' and fetched_at>now()-interval '24 hours') then return jsonb_build_object('status','cached');end if;
 select * into last_run from public.crm_company_data_sync_logs where tax_id=p_tax_id and provider='moc_open_data' order by started_at desc limit 1;
 if last_run.status='started' and last_run.started_at>now()-interval '60 seconds' then return jsonb_build_object('status','busy');end if;
 if last_run.status='failed' and last_run.started_at>now()-interval '5 minutes' then return jsonb_build_object('status','cooldown','error_code',last_run.error_code);end if;
 insert into public.crm_company_data_sync_logs(tax_id,provider,request_key,status,initiated_by) values(p_tax_id,'moc_open_data',p_request_key,'started',p_actor_id);
 return jsonb_build_object('status','started');
end $$;
create function public.crm_finish_moc_sync(p_request_key text,p_profile jsonb default null,p_error_code text default null) returns void language plpgsql security invoker set search_path='' as $$
declare job public.crm_company_data_sync_logs;
begin
 select * into job from public.crm_company_data_sync_logs where request_key=p_request_key and provider='moc_open_data' for update;
 if not found or job.status<>'started' then raise exception 'INVALID_SYNC_JOB';end if;
 if p_error_code is not null then
  if p_error_code not in ('MOC_BLOCKED','MOC_INVALID_RESPONSE','MOC_ID_MISMATCH','MOC_INVALID_AMOUNT','MOC_NOT_FOUND','MOC_UNAVAILABLE','MOC_TIMEOUT') then raise exception 'INVALID_ERROR';end if;
  update public.crm_company_data_sync_logs set status='failed',finished_at=clock_timestamp(),error_code=p_error_code where id=job.id;return;
 end if;
 if p_profile->>'tax_id' is distinct from job.tax_id then raise exception 'TAX_ID_MISMATCH';end if;
 insert into public.crm_company_profiles(tax_id,company_name,company_name_en,registration_status,registration_date,registered_capital,address,currency,source_provider,source_reference,source_as_of,fetched_at)
 values(job.tax_id,p_profile->>'company_name',p_profile->>'company_name_en',p_profile->>'registration_status',(p_profile->>'registration_date')::date,(p_profile->>'registered_capital')::numeric,coalesce(p_profile->'address','{}'::jsonb),'THB','MOC Open Data','https://data.moc.go.th/OpenData/Juristic?juristic_id='||job.tax_id,null,clock_timestamp())
 on conflict(tax_id) do update set company_name=excluded.company_name,company_name_en=excluded.company_name_en,registration_status=excluded.registration_status,registration_date=excluded.registration_date,registered_capital=excluded.registered_capital,address=excluded.address,currency=excluded.currency,source_provider=excluded.source_provider,source_reference=excluded.source_reference,source_as_of=null,fetched_at=excluded.fetched_at;
 update public.crm_company_data_sync_logs set status='succeeded',finished_at=clock_timestamp() where id=job.id;
end $$;
revoke all on function public.crm_claim_moc_sync(text,text,uuid),public.crm_finish_moc_sync(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_claim_moc_sync(text,text,uuid),public.crm_finish_moc_sync(text,jsonb,text) to service_role;
comment on column public.crm_company_profiles.source_as_of is 'Provider data as-of date, unknown for MOC; fetched_at is the retrieval timestamp and must not be presented as source freshness.';
