create or replace function private.crm_notification_done(n public.notifications)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when n.event_kind in ('delivery_failed','opportunity_result') then false
 when n.related_module='leads' then exists(select 1 from public.leads l where l.id=n.related_id and
  (case when n.title like 'โปรด Assign Lead:%' or n.event_kind='lead_assign' then
    (l.owner_id is not null and l.status not in ('new','review')) or l.status in ('converted','disqualified') or l.lead_assigner_id is distinct from n.user_id
   else l.status in ('contacted','follow','qualified','proposed','converted','disqualified') or (coalesce(l.owner_id,l.lead_assigner_id) is distinct from n.user_id and n.event_kind is distinct from 'escalation') end))
 when n.related_module='activities' then exists(select 1 from public.activities a where a.id=n.related_id and (lower(a.status) in ('completed','done','cancelled','canceled') or a.owner_id is distinct from n.user_id and n.event_kind is distinct from 'escalation'))
 when n.related_module='quotations' and (n.title like 'Quotation approval:%' or n.event_kind='approval_request') then not exists(select 1 from public.crm_approval_requests r where r.quotation_id=n.related_id and r.status='pending' and r.approver_ids[r.current_step]=n.user_id)
 when n.related_module='quotations' and n.event_kind='quotation_expiring' then exists(select 1 from public.quotations q where q.id=n.related_id and (q.status in ('accepted','rejected','cancelled','expired') or q.valid_until>(now() at time zone 'Asia/Bangkok')::date+7))
 when n.related_module='contracts' then exists(select 1 from public.contracts c where c.id=n.related_id and (lower(c.status) in ('cancelled','canceled','terminated','inactive','renewed') or lower(c.renewal_status)='renewed' or (n.event_kind='renewal_owner_missing' and coalesce(c.renewal_owner_id,c.owner_id) is not null)))
 when n.related_module='opportunities' and n.event_kind in ('opportunity_due','opportunity_stale') then exists(select 1 from public.opportunities o where o.id=n.related_id and (lower(o.status) in ('won','lost','cancelled','closed') or (n.event_kind='opportunity_due' and o.close_date>(now() at time zone 'Asia/Bangkok')::date+7) or (n.event_kind='opportunity_stale' and o.updated_at>n.created_at)))
 when n.related_module='tickets' then exists(select 1 from public.tickets t where t.id=n.related_id and lower(t.status) in ('resolved','closed','cancelled','canceled'))
 else false end
$$;
