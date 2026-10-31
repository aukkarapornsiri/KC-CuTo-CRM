-- Provider-neutral preparation only. No external requests or scheduled jobs are enabled.
create function public.crm_valid_juristic_id(value text) returns boolean language plpgsql immutable strict set search_path='' as $$
declare total integer:=0; i integer;
begin
 if value !~ '^0[0-9]{12}$' then return false; end if;
 for i in 1..12 loop total:=total+substring(value,i,1)::integer*(14-i); end loop;
 return (11-total%11)%10=substring(value,13,1)::integer and value<>'0000000000000';
end $$;
revoke all on function public.crm_valid_juristic_id(text) from public,anon;
grant execute on function public.crm_valid_juristic_id(text) to authenticated,service_role;
create table public.crm_company_data_settings (
 singleton boolean primary key default true check(singleton),
 planned_provider text not null default 'unconfigured' check(planned_provider in ('unconfigured','dbd_bdex','other_licensed')),
 connection_status text not null default 'not_configured' check(connection_status='not_configured'),
 automatic_sync boolean not null default false check(not automatic_sync),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
insert into public.crm_company_data_settings(singleton) values(true);
create table public.crm_company_profiles (
 tax_id text primary key check(public.crm_valid_juristic_id(tax_id)),
 company_name text not null check(length(company_name) between 1 and 500),
 registration_status text, registration_date date,
 registered_capital numeric(24,2) check(registered_capital>=0),
 currency text not null default 'THB' check(currency='THB'),
 source_provider text not null check(length(source_provider) between 1 and 100),
 source_reference text not null check(length(source_reference) between 1 and 500),
 source_as_of date not null, fetched_at timestamptz not null default now()
);
create table public.crm_company_financial_statements (
 tax_id text not null references public.crm_company_profiles(tax_id) on delete restrict,
 fiscal_year integer not null check(fiscal_year between 1900 and 2200),
 statement_scope text not null default 'standalone' check(statement_scope in ('standalone','consolidated')),
 period_start date not null,period_end date not null check(period_end>=period_start),
 currency text not null default 'THB' check(currency='THB'),
 revenue numeric(24,2), expenses numeric(24,2), net_profit numeric(24,2),
 assets numeric(24,2) check(assets>=0), liabilities numeric(24,2) check(liabilities>=0),equity numeric(24,2),
 source_provider text not null check(length(source_provider) between 1 and 100),
 source_reference text not null check(length(source_reference) between 1 and 500),
 source_as_of date not null,fetched_at timestamptz not null default now(),
 primary key(tax_id,fiscal_year,statement_scope)
);
create table public.crm_company_data_sync_logs (
 id uuid primary key default gen_random_uuid(),
 tax_id text not null check(public.crm_valid_juristic_id(tax_id)),
 provider text not null,request_key text not null unique,
 status text not null check(status in ('started','succeeded','failed')),
 started_at timestamptz not null default now(),finished_at timestamptz,
 error_code text check(length(error_code)<=100),
 check((status='started' and finished_at is null) or (status<>'started' and finished_at is not null))
);
create index crm_company_sync_tax_time on public.crm_company_data_sync_logs(tax_id,started_at desc);
alter table public.crm_company_data_settings enable row level security;
alter table public.crm_company_profiles enable row level security;
alter table public.crm_company_financial_statements enable row level security;
alter table public.crm_company_data_sync_logs enable row level security;
revoke all on public.crm_company_data_settings,public.crm_company_profiles,public.crm_company_financial_statements,public.crm_company_data_sync_logs from anon,authenticated;
grant select on public.crm_company_data_settings,public.crm_company_profiles,public.crm_company_financial_statements,public.crm_company_data_sync_logs to authenticated;
grant update(planned_provider) on public.crm_company_data_settings to authenticated;
grant all on public.crm_company_data_settings,public.crm_company_profiles,public.crm_company_financial_statements,public.crm_company_data_sync_logs to service_role;
create policy company_settings_read on public.crm_company_data_settings for select to authenticated using(private.crm_can('customers','view'));
create policy company_settings_update on public.crm_company_data_settings for update to authenticated using(private.crm_is_super_admin()) with check(private.crm_is_super_admin());
create policy company_profile_read on public.crm_company_profiles for select to authenticated using(private.crm_can('customers','view') and private.crm_can('quotations','view') and exists(select 1 from public.customers c where regexp_replace(coalesce(c.tax_id,''),'[[:space:]-]','','g')=crm_company_profiles.tax_id));
create policy company_statement_read on public.crm_company_financial_statements for select to authenticated using(private.crm_can('customers','view') and private.crm_can('quotations','view') and exists(select 1 from public.customers c where regexp_replace(coalesce(c.tax_id,''),'[[:space:]-]','','g')=crm_company_financial_statements.tax_id));
create policy company_sync_read on public.crm_company_data_sync_logs for select to authenticated using(private.crm_is_super_admin());
create function private.crm_stamp_company_settings() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();return new;end $$;
revoke all on function private.crm_stamp_company_settings() from public,anon,authenticated;
create trigger stamp_company_settings before update on public.crm_company_data_settings for each row execute function private.crm_stamp_company_settings();
comment on table public.crm_company_data_settings is 'Preparation only: credentials belong in server secrets. Enabling a licensed provider requires a reviewed provider adapter and migration.';
comment on table public.crm_company_financial_statements is 'THB base units, Gregorian fiscal year; null means unavailable, never zero. Provider adapter writes via service role only after tax ID and provenance checks.';
