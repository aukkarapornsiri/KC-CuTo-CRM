-- Cost snapshots are internal: never add financial data to the public SO payload.
create table public.crm_sales_order_cost_sheets (
 sales_order_id uuid primary key references public.crm_sales_orders(id) on delete cascade,
 cost_total numeric, gp_amount numeric, gp_margin numeric, line_financials jsonb,
 quotation_note text, payment_instructions text,
 captured_at timestamptz not null default now()
);
alter table public.crm_sales_order_cost_sheets enable row level security;
revoke all on public.crm_sales_order_cost_sheets from public,anon,authenticated;
grant select on public.crm_sales_order_cost_sheets to authenticated;
create policy cost_sheet_read on public.crm_sales_order_cost_sheets for select to authenticated
using (private.crm_quote_financial_access() and exists(select 1 from public.crm_sales_orders s where s.id=sales_order_id));
create function private.crm_capture_so_cost_sheet() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.crm_sales_order_cost_sheets(sales_order_id,cost_total,gp_amount,gp_margin,line_financials,quotation_note,payment_instructions)
 select new.id,f.cost_total,f.gp_amount,f.gp_margin,f.line_financials,q.note,q.payment_instructions
 from public.quotations q left join public.crm_quotation_financials f on f.quotation_id=q.id where q.id=new.quotation_id;
 return new;
end $$;
revoke all on function private.crm_capture_so_cost_sheet() from public,anon,authenticated;
create trigger capture_so_cost_sheet after insert on public.crm_sales_orders for each row execute function private.crm_capture_so_cost_sheet();
-- Existing SOs retain their quote's stored costs, never today's catalog prices.
insert into public.crm_sales_order_cost_sheets(sales_order_id,cost_total,gp_amount,gp_margin,line_financials,quotation_note,payment_instructions)
select s.id,f.cost_total,f.gp_amount,f.gp_margin,f.line_financials,q.note,q.payment_instructions
from public.crm_sales_orders s join public.quotations q on q.id=s.quotation_id left join public.crm_quotation_financials f on f.quotation_id=q.id
on conflict do nothing;
notify pgrst,'reload schema';
