-- Linked work advances an early-stage lead; terminal/manual qualified states stay intact.
-- Invoker security preserves existing CRM RLS and permission boundaries.
create or replace function private.crm_lead_action_status()
returns trigger language plpgsql security invoker set search_path='' as $$
declare lead_key uuid; target_status text; linked public.leads;
begin
 if tg_table_name='activities' then
  if new.related_module is distinct from 'leads' or new.related_id is null then return new; end if;
  if tg_op='UPDATE' then
   if new.related_module is not distinct from old.related_module and new.related_id is not distinct from old.related_id and new.status is not distinct from old.status then return new; end if;
  end if;
  lead_key:=new.related_id;
  target_status:=case when new.status in ('planned','in-progress') then 'follow' when new.status='completed' then 'contacted' end;
 else
  if new.lead_id is null then return new; end if;
  if tg_op='UPDATE' and new.lead_id is not distinct from old.lead_id then return new; end if;
  lead_key:=new.lead_id;target_status:='qualified';
 end if;
 select * into linked from public.leads where id=lead_key;
 if not found then raise exception 'Linked lead not found or access denied'; end if;
 if linked.customer_id is not null and new.customer_id is not null and linked.customer_id<>new.customer_id then raise exception 'Linked lead belongs to another customer'; end if;
 -- Activity creation alone never grants lead editing privileges.
 if auth.uid() is not null and not private.crm_can('leads','edit') then return new; end if;
 if target_status is not null then
  update public.leads set status=target_status,updated_at=now()
  where id=lead_key and status in ('new','review','assign','contacted','follow')
    and status<>target_status and (target_status<>'contacted' or status='new');
 end if;
 return new;
end $$;
revoke all on function private.crm_lead_action_status() from public,anon;
drop trigger if exists crm_lead_action_status on public.activities;
create trigger crm_lead_action_status after insert or update on public.activities for each row execute function private.crm_lead_action_status();
drop trigger if exists crm_lead_action_status on public.opportunities;
create trigger crm_lead_action_status after insert or update on public.opportunities for each row execute function private.crm_lead_action_status();

create or replace function private.crm_lead_assignment_status()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is not distinct from old.status and old.status in ('new','review')
    and new.owner_id is not null and new.owner_id is distinct from old.owner_id then
  new.status:='assign';
 end if;
 return new;
end $$;
revoke all on function private.crm_lead_assignment_status() from public,anon;
drop trigger if exists crm_lead_assignment_status on public.leads;
create trigger crm_lead_assignment_status before update on public.leads for each row execute function private.crm_lead_assignment_status();
