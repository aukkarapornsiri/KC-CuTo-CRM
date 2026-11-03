-- Retain referenced policy IDs and request snapshots when an administrator removes a flow.
alter table public.crm_approval_policies add column deleted_at timestamptz;
create or replace function private.crm_policy_validate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 if tg_op='UPDATE' and old.deleted_at is not null then raise exception 'Approval flow has been deleted';end if;
 if new.deleted_at is not null then
  if tg_op='INSERT' then raise exception 'Use the approval flow archive action';end if;
  if new.is_active or (to_jsonb(new)-array['deleted_at','is_active','updated_at']) is distinct from (to_jsonb(old)-array['deleted_at','is_active','updated_at']) then raise exception 'Invalid approval flow archive';end if;
  new.updated_at:=clock_timestamp();return new;
 end if;
 if cardinality(new.approver_ids) not between 1 and 8 or cardinality(new.approver_ids)<>(select count(distinct x) from unnest(new.approver_ids) x) then raise exception 'Select 1–8 distinct approvers in order';end if;
 if exists(select 1 from unnest(new.approver_ids) x where not private.crm_flow_eligible(x)) then raise exception 'Every approver must be active and have approval permission';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.crm_policy_validate() from public,anon,authenticated;
create function private.crm_archive_approval_flow(p_id uuid,p_expected_updated_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare row public.crm_approval_policies;begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 select * into row from public.crm_approval_policies where id=p_id for update;
 if not found then raise exception 'Approval flow not found';end if;
 if row.deleted_at is not null then return row.id;end if;
 if p_expected_updated_at is null or row.updated_at is distinct from p_expected_updated_at then raise exception 'Approval flow changed; reload before deleting';end if;
 update public.crm_approval_policies set is_active=false,deleted_at=clock_timestamp() where id=row.id;
 return row.id;
end $$;
revoke all on function private.crm_archive_approval_flow(uuid,timestamptz) from public,anon;
grant execute on function private.crm_archive_approval_flow(uuid,timestamptz) to authenticated;
create function public.crm_archive_approval_flow(p_id uuid,p_expected_updated_at timestamptz) returns uuid language sql security invoker set search_path='' as $$select private.crm_archive_approval_flow(p_id,p_expected_updated_at)$$;
revoke all on function public.crm_archive_approval_flow(uuid,timestamptz) from public,anon;
grant execute on function public.crm_archive_approval_flow(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
