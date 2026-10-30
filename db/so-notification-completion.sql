-- Resolve only completed approval requests; retain informational outcomes and email behavior.
create or replace function private.crm_resolve_so_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if tg_table_name='crm_so_approvals' then
  sid:=case when tg_op='DELETE' then old.sales_order_id else new.sales_order_id end;
 else
  sid:=case when tg_op='DELETE' then old.id else new.id end;
 end if;
 update public.notifications n set resolved_at=now(),resolution=case when tg_op='DELETE' then 'record_removed' else 'completed' end
 where n.resolved_at is null and n.event_kind='approval_requested'
 and n.event_key like 'so-approval:'||sid::text||':%'
 and (tg_op='DELETE' or not exists(
  select 1 from public.crm_so_approvals a join public.crm_sales_orders o on o.id=a.sales_order_id
  where a.sales_order_id=sid and a.status='pending' and o.status<>'cancelled'
   and a.revision::text=split_part(n.event_key,':',3)
 ));
 return null;
end $$;
revoke all on function private.crm_resolve_so_notifications() from public,anon,authenticated;
drop trigger if exists crm_resolve_so_notifications on public.crm_so_approvals;
create trigger crm_resolve_so_notifications after insert or update or delete on public.crm_so_approvals
 for each row execute function private.crm_resolve_so_notifications();
drop trigger if exists crm_resolve_so_notifications on public.crm_sales_orders;
create trigger crm_resolve_so_notifications after update or delete on public.crm_sales_orders
 for each row execute function private.crm_resolve_so_notifications();
create index if not exists crm_notification_open_record on public.notifications(related_module,related_id) where resolved_at is null;
update public.notifications n set resolved_at=now(),resolution='completed'
where n.resolved_at is null and n.event_kind='approval_requested' and n.event_key like 'so-approval:%'
and exists(select 1 from public.crm_so_approvals a join public.crm_sales_orders o on o.id=a.sales_order_id
 where a.sales_order_id::text=split_part(n.event_key,':',2)
 and (a.status<>'pending' or o.status='cancelled' or a.revision::text<>split_part(n.event_key,':',3)));
