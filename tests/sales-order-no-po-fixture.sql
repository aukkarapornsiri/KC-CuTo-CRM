create role anon;create role authenticated;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.crm_can(text,text) returns boolean language sql as $$select auth.uid()='11111111-1111-4111-8111-111111111111'::uuid$$;
create sequence private.crm_sales_order_number;
create table profiles(id uuid primary key,email text,display_name text,is_active boolean,deleted_at timestamptz);
create table customers(id uuid primary key);
create table quotations(id uuid primary key default gen_random_uuid(),customer_id uuid,owner_id uuid,status text,approval_status text,code text,customer_name text,owner_name text,counterparty_address text,counterparty_tax_id text,items jsonb,subtotal numeric,discount numeric,vat numeric,total numeric,withholding_tax numeric,net_total numeric,currency text,payment_terms int);
create table storage.objects(bucket_id text,name text);
create table crm_price_items(id uuid,code text);
create table crm_quotation_financials(quotation_id uuid,gp_amount numeric);
create table crm_sales_order_cost_sheets(sales_order_id uuid);
create table crm_so_amendments(id uuid);
create table public.crm_sales_orders (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 quotation_id uuid not null unique references public.quotations(id),
 quotation_code text not null,
 customer_id uuid not null references public.customers(id),
 customer_name text not null,
 owner_id uuid not null references public.profiles(id),
 owner_name text not null default '',
 billing_address text not null default '',
 tax_id text not null default '',
 po_number text not null check(length(btrim(po_number)) between 1 and 200),
 po_date date not null,
 po_file_key text not null,
 po_file_name text not null,
 expected_delivery_date date,
 status text not null default 'confirmed' check(status in ('confirmed','delivered','completed','cancelled')),
 items jsonb not null check(jsonb_typeof(items)='array'),
 subtotal numeric not null,discount numeric not null,vat numeric not null,total numeric not null,
 withholding_tax numeric not null,net_total numeric not null,
 currency text not null,payment_terms integer not null default 0,
 note text not null default '',
 delivery_reference text,delivered_at timestamptz,completed_at timestamptz,
 cancellation_reason text,cancelled_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);

alter table crm_sales_orders add column delivery_details jsonb not null default '{}';
create table kc_dw_sales_order_facts(id uuid,source_system text,source_so_id text,so_number text,sales_email text,sales_name text,converted_at timestamptz,period_month date,net_amount numeric,gross_profit numeric,status text,source_updated_at timestamptz,customer_id uuid,customer_name text,product_lines jsonb,currency text);
create table crm_sales_order_events(sales_order_id uuid,action text,note text,actor_id uuid);
create table audit_logs(user_id uuid,action text,module text,record_id uuid,changes jsonb);
create table crm_so_approvals(sales_order_id uuid primary key,status text);
create function private.crm_so_approval_action(uuid,text,text) returns void language plpgsql as $$begin if current_setting('test.approval_failure',true)='true' then raise exception 'Approval unavailable';end if;insert into public.crm_so_approvals values($1,'pending');end$$;
insert into profiles values('11111111-1111-4111-8111-111111111111','qa@example.test','QA',true,null);
insert into customers values('11111111-1111-4111-8111-111111111111');
insert into storage.objects values('crm-sales-orders','11111111-1111-4111-8111-111111111111/po.pdf');
