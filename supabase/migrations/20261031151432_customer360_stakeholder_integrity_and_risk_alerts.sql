-- Reuse contact roles, influence_level and reports_to_id; do not create duplicate people.
create function private.crm_guard_contact_reporting() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_customer uuid;
begin
 if tg_op='UPDATE' and new.customer_id is distinct from old.customer_id and exists(select 1 from public.contacts where reports_to_id=new.id) then raise exception 'Detach reporting relationships before moving contact';end if;
 if new.reports_to_id is null then return new;end if;
 if new.id=new.reports_to_id or new.customer_id is null then raise exception 'Invalid reporting relationship';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-contact-map:'||new.customer_id::text,0));
 select customer_id into parent_customer from public.contacts where id=new.reports_to_id;
 if not found or parent_customer is distinct from new.customer_id then raise exception 'Reporting manager must belong to the same customer';end if;
 if exists(with recursive chain(id,reports_to_id) as (select id,reports_to_id from public.contacts where id=new.reports_to_id union select c.id,c.reports_to_id from public.contacts c join chain p on c.id=p.reports_to_id) select 1 from chain where id=new.id) then raise exception 'Reporting cycle is not allowed';end if;
 return new;
end $$;
revoke all on function private.crm_guard_contact_reporting() from public,anon,authenticated;
create trigger crm_guard_contact_reporting before insert or update of reports_to_id,customer_id on public.contacts for each row execute function private.crm_guard_contact_reporting();
-- A narrow integrity trigger needs complete ancestry to detect cycles hidden by row visibility.
-- It never changes privileges, returns records to callers or writes other contacts.
create function private.crm_customer_health_reminders() returns void language plpgsql security definer set search_path='' as $$
begin
 update public.notifications n set resolved_at=coalesce(n.resolved_at,clock_timestamp()),resolution='risk_cleared'
 where n.event_kind='customer_health' and not exists(
  select 1 from public.customers c where c.id=n.related_id and c.owner_id=n.user_id
   and private.crm_assignment_eligible(c.owner_id,'customers') and private.crm_assignment_eligible(c.owner_id,'activities')
   and exists(select 1 from public.activities a where a.customer_id=c.id and a.owner_id=c.owner_id and a.status not in ('completed','cancelled') and a.scheduled_at<now()-interval '1 day'));
 insert into public.notifications(user_id,type,title,body,related_module,related_id,event_kind,event_key,priority)
 select c.owner_id,'activity','Customer needs follow-up: '||c.code,c.code,'customers',c.id,'customer_health','customer-health:'||c.id::text||':'||c.owner_id::text,'normal'
 from public.customers c where c.owner_id is not null and private.crm_assignment_eligible(c.owner_id,'customers') and private.crm_assignment_eligible(c.owner_id,'activities')
 and exists(select 1 from public.activities a where a.customer_id=c.id and a.owner_id=c.owner_id and a.status not in ('completed','cancelled') and a.scheduled_at<now()-interval '1 day')
 on conflict(user_id,event_key) where event_key is not null do update set title=excluded.title,body=excluded.body,is_read=false,resolved_at=null,resolution=null,created_at=clock_timestamp()
 where notifications.resolution='risk_cleared';
end $$;
revoke all on function private.crm_customer_health_reminders() from public,anon,authenticated;
select cron.schedule('crm-customer-health-reminders','15 * * * *','select private.crm_customer_health_reminders();');
