-- One permission-scoped source for Customer 360 sales and reconciliation.
create view public.crm_customer_sales_orders with(security_invoker=true) as
select s.id,s.customer_id,s.code so_number,'KC CuTo CRM'::text source_system,s.id::text source_so_id,
 round(s.subtotal-s.discount,2) net_amount,s.currency,case when s.status='cancelled' then 'cancelled' else 'converted' end status,
 s.created_at converted_at,s.updated_at source_updated_at,s.updated_at synced_at,null::text customer_source_id,s.id native_order_id,
 case when f.id is null then 'missing_fact' when f.customer_id is distinct from s.customer_id or f.currency is distinct from s.currency or f.net_amount is distinct from round(s.subtotal-s.discount,2) or f.status is distinct from case when s.status='cancelled' then 'cancelled' else 'converted' end then 'mismatch' else 'matched' end reconciliation,
 f.net_amount fact_amount,f.customer_id fact_customer_id
from public.crm_sales_orders s left join public.kc_dw_sales_order_facts f on f.source_system='KC CuTo CRM' and f.source_so_id=s.id::text
union all
select f.id,f.customer_id,f.so_number,f.source_system,f.source_so_id,f.net_amount,f.currency,f.status,f.converted_at,f.source_updated_at,f.synced_at,f.customer_source_id,null::uuid,
 case when f.source_system='KC CuTo CRM' then 'orphan_fact' else 'external' end,f.net_amount,f.customer_id
from public.kc_dw_sales_order_facts f where not exists(select 1 from public.crm_sales_orders s where f.source_system='KC CuTo CRM' and f.source_so_id=s.id::text);
revoke all on public.crm_customer_sales_orders from public,anon;
grant select on public.crm_customer_sales_orders to authenticated,service_role;

-- Unified operational signals; invoker security retains every source's RLS.
create view public.crm_customer_health_signals with(security_invoker=true) as
with raw as (select c.id customer_id,c.code,c.name,c.owner_id,c.owner_name,c.created_at,
 private.crm_can('activities','view') activities_available,private.crm_can('tickets','view') tickets_available,private.crm_can('contracts','view') contracts_available,private.crm_can('contacts','view') contacts_available,private.crm_can('quotations','view') orders_available,
 (select max(a.scheduled_at) from public.activities a where a.customer_id=c.id and a.status='completed' and a.scheduled_at<=now() and a.type in ('Call','Email','Meeting','Online Meeting','Visit','Demo','LINE Contact','Proposal Follow-up','Renewal Follow-up','Service Follow-up')) last_contact,
 (select count(*) from public.activities a where a.customer_id=c.id and a.status not in ('completed','cancelled','closed','resolved') and a.scheduled_at<now()) overdue,
 (select count(*) from public.activities a where a.customer_id=c.id and a.owner_id=c.owner_id and a.status not in ('completed','cancelled','closed','resolved') and a.scheduled_at<now()-interval '1 day') owner_overdue,
 (select count(*) from public.tickets t where t.customer_id=c.id and t.status not in ('completed','cancelled','closed','resolved') and t.created_at<now()-interval '14 days') aged_cases,
 (select count(*) from public.contracts s where s.customer_id=c.id and s.status='active' and s.end_date between (now() at time zone 'Asia/Bangkok')::date and (now() at time zone 'Asia/Bangkok')::date+30 and not exists(select 1 from public.activities a where a.customer_id=c.id and a.related_module='contracts' and a.related_id=s.id and a.status not in ('completed','cancelled','closed','resolved') and a.scheduled_at>=now())) renewal_gaps,
 (select count(*) from public.contacts p where p.customer_id=c.id and lower(coalesce(p.status,''))<>'inactive') active_contacts,
 (select count(*) from public.contacts p where p.customer_id=c.id and lower(coalesce(p.status,''))<>'inactive' and lower(trim(p.role)) in ('decision maker','approver','executive')) decision_contacts,
 (select coalesce(sum(s.net_amount),0) from public.crm_customer_sales_orders s where s.customer_id=c.id and s.status='converted' and s.currency='THB' and s.converted_at between now()-interval '90 days' and now()) current_sales,
 (select coalesce(sum(s.net_amount),0) from public.crm_customer_sales_orders s where s.customer_id=c.id and s.status='converted' and s.currency='THB' and s.converted_at>=now()-interval '180 days' and s.converted_at<now()-interval '90 days') prior_sales,
 (select count(*) from public.crm_customer_sales_orders s where s.customer_id=c.id and s.status='converted' and s.currency='THB' and (s.net_amount is null or s.net_amount<0 or s.converted_at is null or s.converted_at>now())) invalid_sales,
 (select count(*) from public.crm_customer_sales_orders s where s.customer_id=c.id and s.reconciliation in ('mismatch','missing_fact','orphan_fact')) reconciliation_issues,
 (select count(*) from public.activities a where a.customer_id=c.id and a.status not in ('completed','cancelled','closed','resolved') and a.scheduled_at>=now()) upcoming_tasks
from public.customers c), scored as(select *,
 case when coalesce(last_contact,created_at)<now()-interval '60 days' then 15 when coalesce(last_contact,created_at)<now()-interval '30 days' then 8 else 0 end engagement_penalty,
 case when overdue>0 then least(25,10+5*overdue)::int else 0 end followup_penalty,
 case when aged_cases>0 then 15 else 0 end service_penalty,case when renewal_gaps>0 then 15 else 0 end renewal_penalty,
 case when prior_sales>0 and current_sales<prior_sales*.5 then 20 else 0 end purchase_penalty,
 case when active_contacts=0 then 10 when decision_contacts=0 then 5 else 0 end stakeholder_penalty
from raw)
select *, (case when activities_available then 40 else 0 end+case when tickets_available then 15 else 0 end+case when contracts_available and activities_available then 15 else 0 end+case when contacts_available then 10 else 0 end+case when orders_available and invalid_sales=0 then 20 else 0 end) coverage,
 100-(case when activities_available then engagement_penalty+followup_penalty else 0 end+case when tickets_available then service_penalty else 0 end+case when contracts_available and activities_available then renewal_penalty else 0 end+case when contacts_available then stakeholder_penalty else 0 end+case when orders_available and invalid_sales=0 then purchase_penalty else 0 end) score
from scored;
revoke all on public.crm_customer_health_signals from public,anon;
grant select on public.crm_customer_health_signals to authenticated,service_role;

-- Private reminder job: eligibility is checked per recipient AND per signal.
create or replace function private.crm_customer_health_reminders() returns void language plpgsql security definer set search_path='' as $$
begin
 create temporary table if not exists c360_risk_events(user_id uuid,customer_id uuid,code text,kind text,event_key text) on commit drop;
 truncate pg_temp.c360_risk_events;
 insert into pg_temp.c360_risk_events
 select h.owner_id,h.customer_id,h.code,r.kind,
 case when r.kind='customer_health' then 'customer-health:'||h.customer_id||':'||h.owner_id else r.kind||':'||h.customer_id||':'||h.owner_id end
 from public.crm_customer_health_signals h cross join lateral(values
 ('customer_health',h.owner_overdue>0 and private.crm_assignment_eligible(h.owner_id,'activities')),
 ('customer_health_engagement',h.engagement_penalty>0 and private.crm_assignment_eligible(h.owner_id,'activities')),
 ('customer_health_service',h.service_penalty>0 and private.crm_assignment_eligible(h.owner_id,'tickets')),
 ('customer_health_renewal',h.renewal_penalty>0 and private.crm_assignment_eligible(h.owner_id,'contracts') and private.crm_assignment_eligible(h.owner_id,'activities')),
 ('customer_health_purchases',h.purchase_penalty>0 and h.invalid_sales=0 and private.crm_assignment_eligible(h.owner_id,'quotations')),
 ('customer_health_stakeholders',h.stakeholder_penalty>0 and private.crm_assignment_eligible(h.owner_id,'contacts'))
 ) r(kind,triggered) where h.owner_id is not null and private.crm_assignment_eligible(h.owner_id,'customers') and r.triggered;
 update public.notifications n set resolved_at=coalesce(n.resolved_at,clock_timestamp()),resolution='risk_cleared' where n.event_kind like 'customer_health%' and not exists(select 1 from pg_temp.c360_risk_events e where e.user_id=n.user_id and e.event_key=n.event_key);
 insert into public.notifications(user_id,type,title,body,related_module,related_id,event_kind,event_key,priority)
 select user_id,'activity','Customer risk: '||code,code,'customers',customer_id,kind,event_key,'normal' from pg_temp.c360_risk_events
 on conflict(user_id,event_key) where event_key is not null do update set title=excluded.title,body=excluded.body,is_read=false,resolved_at=null,resolution=null,created_at=clock_timestamp() where notifications.resolution='risk_cleared';
end $$;
revoke all on function private.crm_customer_health_reminders() from public,anon,authenticated;

create table public.crm_customer_communications(
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers(id),
 provider text not null check(provider in ('outlook','line','phone','other')),external_id text not null check(length(external_id) between 1 and 500),
 direction text not null check(direction in ('inbound','outbound')),subject text not null default '' check(length(subject)<=500),
 body text not null default '' check(length(body)<=10000),occurred_at timestamptz not null check(occurred_at<now()+interval '1 day'),
 participant text not null default '' check(length(participant)<=320),source_reference text check(length(source_reference)<=1000),
 created_at timestamptz not null default now(),created_by uuid references public.profiles(id),unique(provider,external_id,customer_id)
);
create index crm_communications_customer_time on public.crm_customer_communications(customer_id,occurred_at desc);
alter table public.crm_customer_communications enable row level security;
revoke all on public.crm_customer_communications from public,anon,authenticated;
grant select,insert on public.crm_customer_communications to authenticated;
grant all on public.crm_customer_communications to service_role;
create policy c360_communications_read on public.crm_customer_communications for select to authenticated using(private.crm_can('customers','view') and private.crm_can('activities','view') and exists(select 1 from public.customers c where c.id=customer_id));
create policy c360_communications_insert on public.crm_customer_communications for insert to authenticated with check(private.crm_can('customers','view') and private.crm_can('activities','create') and created_by=auth.uid() and exists(select 1 from public.customers c where c.id=customer_id));
create table public.crm_customer_channel_links(
 provider text not null check(provider='line'),identifier text not null check(identifier ~ '^U[0-9a-f]{32}$'),
 customer_id uuid not null references public.customers(id),created_by uuid not null default auth.uid() references public.profiles(id),created_at timestamptz not null default now(),primary key(provider,identifier)
);
alter table public.crm_customer_channel_links enable row level security;
revoke all on public.crm_customer_channel_links from public,anon,authenticated;
grant select,insert,delete on public.crm_customer_channel_links to authenticated;
grant all on public.crm_customer_channel_links to service_role;
create policy c360_channel_admin on public.crm_customer_channel_links for all to authenticated using(private.crm_is_super_admin()) with check(private.crm_is_super_admin());

-- Controlled statement import; all financial values keep decimal precision in Postgres.
create function public.crm_import_company_statement(p_customer_id uuid,p_statement jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tax text; v jsonb:=p_statement;
begin
 if not private.crm_is_super_admin() then raise exception 'ACCESS_DENIED';end if;
 select regexp_replace(tax_id,'[[:space:]-]','','g') into tax from public.customers where id=p_customer_id;
 if tax is null or not public.crm_valid_juristic_id(tax) or tax is distinct from v->>'tax_id' then raise exception 'TAX_ID_MISMATCH';end if;
 if not exists(select 1 from public.crm_company_profiles where tax_id=tax) and coalesce(v->>'company_name','')='' then raise exception 'COMPANY_PROFILE_REQUIRED';end if;
 if (v->>'source_as_of')::date>current_date or coalesce(v->>'source_reference','') !~ '^https://' or length(v->>'source_reference')>500 or coalesce(v->>'source_provider','')='' then raise exception 'PROVENANCE_REQUIRED';end if;
 if (v->>'period_end')::date>current_date or extract(year from (v->>'period_end')::date)<>(v->>'fiscal_year')::int then raise exception 'INVALID_PERIOD';end if;
 insert into public.crm_company_profiles(tax_id,company_name,source_provider,source_reference,source_as_of) values(tax,coalesce(nullif(v->>'company_name',''),(select company_name from public.crm_company_profiles where tax_id=tax)),v->>'source_provider',v->>'source_reference',(v->>'source_as_of')::date) on conflict(tax_id) do nothing;
 insert into public.crm_company_financial_statements(tax_id,fiscal_year,statement_scope,period_start,period_end,revenue,expenses,net_profit,assets,liabilities,equity,source_provider,source_reference,source_as_of)
 values(tax,(v->>'fiscal_year')::int,v->>'statement_scope',(v->>'period_start')::date,(v->>'period_end')::date,(v->>'revenue')::numeric,(v->>'expenses')::numeric,(v->>'net_profit')::numeric,(v->>'assets')::numeric,(v->>'liabilities')::numeric,(v->>'equity')::numeric,v->>'source_provider',v->>'source_reference',(v->>'source_as_of')::date)
 on conflict(tax_id,fiscal_year,statement_scope) do update set period_start=excluded.period_start,period_end=excluded.period_end,revenue=excluded.revenue,expenses=excluded.expenses,net_profit=excluded.net_profit,assets=excluded.assets,liabilities=excluded.liabilities,equity=excluded.equity,source_provider=excluded.source_provider,source_reference=excluded.source_reference,source_as_of=excluded.source_as_of,fetched_at=clock_timestamp();
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'import','customers',p_customer_id,jsonb_build_object('type','annual_statement','fiscal_year',v->>'fiscal_year','tax_id',tax,'source',v->>'source_reference'));
end $$;
revoke all on function public.crm_import_company_statement(uuid,jsonb) from public,anon;
grant execute on function public.crm_import_company_statement(uuid,jsonb) to authenticated;
create table private.crm_communication_sync_claims(customer_id uuid not null,actor_id uuid not null,claimed_at timestamptz not null default now(),primary key(customer_id,actor_id));
revoke all on private.crm_communication_sync_claims from public,anon,authenticated;
create function public.crm_claim_communication_sync(p_customer uuid,p_actor uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into private.crm_communication_sync_claims(customer_id,actor_id) values(p_customer,p_actor) on conflict(customer_id,actor_id) do update set claimed_at=clock_timestamp() where crm_communication_sync_claims.claimed_at<now()-interval '1 minute';
 return found;
end $$;
revoke all on function public.crm_claim_communication_sync(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_claim_communication_sync(uuid,uuid) to service_role;
grant all on private.crm_communication_sync_claims to service_role;
