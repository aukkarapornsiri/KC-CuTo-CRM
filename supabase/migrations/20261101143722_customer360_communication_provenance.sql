alter policy c360_communications_insert on public.crm_customer_communications with check(provider in ('phone','other') and private.crm_can('customers','view') and private.crm_can('activities','create') and created_by=auth.uid() and exists(select 1 from public.customers c where c.id=customer_id));
alter table private.crm_communication_sync_claims enable row level security;
