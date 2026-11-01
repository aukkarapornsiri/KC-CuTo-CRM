-- CRM-only inventory and orphan-file retention; policies start disabled.
create table public.crm_document_retention_rules(
 bucket_id text primary key check(bucket_id in ('crm-documents','crm-sales-orders','crm-quotation-assets')),
 enabled boolean not null default false,retention_days integer not null default 365 check(retention_days between 7 and 3650),
 run_hour integer not null default 2 check(run_hour between 0 and 23),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
create table public.crm_document_delete_log(
 id uuid primary key default gen_random_uuid(),object_id uuid not null unique,bucket_id text not null,object_key text not null,
 actor_id uuid,source text not null,state text not null check(state in ('deleting','failed','deleted')),
 created_at timestamptz not null default now(),finished_at timestamptz,error text);
alter table public.crm_document_retention_rules enable row level security;
alter table public.crm_document_delete_log enable row level security;
create policy super_admin on public.crm_document_retention_rules for select to authenticated using(private.crm_is_super_admin());
create policy super_admin on public.crm_document_delete_log for select to authenticated using(private.crm_is_super_admin());
grant select on public.crm_document_retention_rules,public.crm_document_delete_log to authenticated;
grant all on public.crm_document_retention_rules,public.crm_document_delete_log to service_role;
insert into public.crm_document_retention_rules(bucket_id) values('crm-documents'),('crm-sales-orders'),('crm-quotation-assets');

-- Conservative substring matching includes references embedded in document snapshots.
create function private.crm_document_referenced(p_key text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t text; found boolean;
begin
 if coalesce(p_key,'')='' then return true; end if;
 foreach t in array array['documents','quotations','crm_sales_orders','crm_quotation_templates','crm_sales_signature_defaults','crm_approval_events','crm_so_approvals','asset_attachments'] loop
  execute format('select exists(select 1 from public.%I r where strpos(to_jsonb(r)::text,$1)>0)',t) into found using p_key;
  if found then return true; end if;
 end loop;
 return false;
end $$;
revoke all on function private.crm_document_referenced(text) from public,anon,authenticated;

create function public.crm_document_inventory(p_from timestamptz default null,p_to timestamptz default null,p_bucket text default '',p_offset integer default 0,p_candidates boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.crm_is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_offset<0 or (p_from is not null and p_to is not null and p_from>=p_to) then raise exception 'Invalid filters'; end if;
 with base as (
 select o.id,o.bucket_id,o.name,o.created_at,o.metadata,private.crm_document_referenced(o.name) as protected,
 coalesce(l.state,'') as deletion_state,r.retention_days,
 o.created_at<now()-make_interval(days=>r.retention_days) as expired
 from storage.objects o join public.crm_document_retention_rules r on r.bucket_id=o.bucket_id
 left join public.crm_document_delete_log l on l.object_id=o.id
 where (p_from is null or o.created_at>=p_from) and (p_to is null or o.created_at<p_to) and (p_bucket='' or o.bucket_id=p_bucket)
 ), filtered as(select * from base where not p_candidates or (expired and not protected)),
 page as(select * from filtered order by created_at desc,id desc offset p_offset limit 50)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.crm_document_inventory(timestamptz,timestamptz,text,integer,boolean) from public,anon;
grant execute on function public.crm_document_inventory(timestamptz,timestamptz,text,integer,boolean) to authenticated;

create function public.crm_document_retention_save(p_bucket text,p_days integer,p_hour integer,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 update public.crm_document_retention_rules set retention_days=p_days,run_hour=p_hour,enabled=p_enabled,updated_at=now(),updated_by=auth.uid() where bucket_id=p_bucket;
 if not found then raise exception 'Invalid bucket'; end if;
 insert into public.audit_logs(user_id,action,module,category,changes) values(auth.uid(),'update','documents','admin_activity',jsonb_build_object('bucket',p_bucket,'days',p_days,'hour_bangkok',p_hour,'enabled',p_enabled));
end $$;
revoke all on function public.crm_document_retention_save(text,integer,integer,boolean) from public,anon;
grant execute on function public.crm_document_retention_save(text,integer,integer,boolean) to authenticated;

-- Prevent a new reference from attaching a file once deletion has been claimed.
create function private.crm_document_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.crm_document_delete_log l where strpos(to_jsonb(new)::text,l.object_key)>0) then
  raise exception 'File is being deleted or has been deleted; upload another file';
 end if;
 return new;
end $$;
revoke all on function private.crm_document_reference_guard() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['documents','quotations','crm_sales_orders','crm_quotation_templates','crm_sales_signature_defaults','crm_approval_events','crm_so_approvals','asset_attachments'] loop
 execute format('create trigger crm_document_reference_guard before insert or update on public.%I for each row execute function private.crm_document_reference_guard()',t);
 end loop;
end $$;

create function public.crm_document_delete_claim(p_object uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o storage.objects; l public.crm_document_delete_log; t text;
begin
 if p_actor is not null and not coalesce(public.crm_actor_can(p_actor,'access','delete'),false) then raise exception 'Super Admin required' using errcode='42501'; end if;
 -- Serialize claims and fence concurrent attachment writes until the tombstone commits.
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(828261101);
 select * into l from public.crm_document_delete_log where object_id=p_object;
 if found then return to_jsonb(l); end if;
 foreach t in array array['documents','quotations','crm_sales_orders','crm_quotation_templates','crm_sales_signature_defaults','crm_approval_events','crm_so_approvals','asset_attachments'] loop
  execute format('lock table public.%I in share row exclusive mode',t);
 end loop;
 select * into o from storage.objects where id=p_object for update;
 if not found or o.bucket_id not in ('crm-documents','crm-sales-orders','crm-quotation-assets') then raise exception 'File not found'; end if;
 if o.created_at>now()-interval '1 day' then raise exception 'Recent upload protected for 24 hours'; end if;
 if private.crm_document_referenced(o.name) then raise exception 'File is referenced by a CRM record'; end if;
 if p_actor is null and not exists(select 1 from public.crm_document_retention_rules r where r.bucket_id=o.bucket_id and r.enabled and o.created_at<now()-make_interval(days=>r.retention_days) and extract(hour from now() at time zone 'Asia/Bangkok')=r.run_hour) then raise exception 'Retention policy not due'; end if;
 insert into public.crm_document_delete_log(object_id,bucket_id,object_key,actor_id,source,state) values(o.id,o.bucket_id,o.name,p_actor,case when p_actor is null then 'scheduled' else 'manual' end,'deleting') returning * into l;
 return to_jsonb(l);
end $$;
create function public.crm_document_delete_finish(p_job uuid,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.crm_document_delete_log set state=case when p_error is null then 'deleted' else 'failed' end,finished_at=now(),error=p_error where id=p_job;
end $$;
create function public.crm_document_retention_candidates() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(id),'[]'::jsonb) from (
 select o.id from storage.objects o join public.crm_document_retention_rules r on r.bucket_id=o.bucket_id
 where r.enabled and extract(hour from now() at time zone 'Asia/Bangkok')=r.run_hour and o.created_at<now()-make_interval(days=>r.retention_days)
 and not private.crm_document_referenced(o.name) order by o.created_at,o.id limit 25) x
$$;
create function public.crm_document_cron_authorized(p_token text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='KC_CRM_DOCUMENT_CRON_TOKEN' and decrypted_secret=p_token)
$$;
revoke all on function public.crm_document_delete_claim(uuid,uuid),public.crm_document_delete_finish(uuid,text),public.crm_document_retention_candidates(),public.crm_document_cron_authorized(text) from public,anon,authenticated;
grant execute on function public.crm_document_delete_claim(uuid,uuid),public.crm_document_delete_finish(uuid,text),public.crm_document_retention_candidates(),public.crm_document_cron_authorized(text) to service_role;
-- The worker performs Storage API deletion, never SQL deletion from storage.objects.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'KC_CRM_DOCUMENT_CRON_TOKEN');
select cron.schedule('crm-document-retention','*/5 * * * *',$job$
 select net.http_post(
 url:='https://tocsxnprspiogawignib.supabase.co/functions/v1/crm-document-retention',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='KC_CRM_DOCUMENT_CRON_TOKEN')),
 body:='{"action":"scheduled"}'::jsonb,timeout_milliseconds:=60000);
$job$);
