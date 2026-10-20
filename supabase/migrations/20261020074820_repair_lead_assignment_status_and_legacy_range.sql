create or replace function private.crm_lead_assignment_status()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
 if new.owner_id is not null and new.status in ('new','review') then
  if tg_op='INSERT' then
   new.status := 'assign';
  elsif new.owner_id is distinct from old.owner_id then
   new.status := 'assign';
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists crm_lead_assignment_status on public.leads;
create trigger crm_lead_assignment_status before insert or update on public.leads
for each row execute function private.crm_lead_assignment_status();

-- Repair the user-reported legacy range only. Preserve progressed statuses.
update public.leads set status='assign',updated_at=now()
where code between 'LD-2552' and 'LD-2595'
and owner_id is not null and status in ('new','review');
