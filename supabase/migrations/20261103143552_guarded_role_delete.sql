-- User-initiated deletion only. No existing role is removed by this migration.
create function private.crm_delete_unused_role(p_role text,p_expected_updated_at timestamptz) returns text language plpgsql security definer set search_path='' as $$
declare target public.custom_roles;perms jsonb;dashboards jsonb;begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 -- Serialize with assignment writes: profiles FK uses ON DELETE SET NULL.
 lock table public.profiles in share row exclusive mode;
 select * into target from public.custom_roles where role_key=p_role for update;
 if not found then raise exception 'Role not found';end if;
 if target.is_system or target.role_key='admin' then raise exception 'Role is protected';end if;
 if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then raise exception 'Role changed; reload before deleting';end if;
 if exists(select 1 from public.profiles p where p.role=p_role or p.custom_role_key=p_role) then raise exception 'Role is in use';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into perms from public.role_permissions x where x.role_key=p_role;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into dashboards from public.dashboard_type_access x where x.role_key=p_role;
 insert into public.audit_logs(user_id,action,module,changes) values(auth.uid(),'delete','settings',jsonb_build_object('role',to_jsonb(target),'permissions',perms,'dashboards',dashboards));
 delete from public.custom_roles where role_key=p_role;
 return p_role;
end $$;
revoke all on function private.crm_delete_unused_role(text,timestamptz) from public,anon;
grant execute on function private.crm_delete_unused_role(text,timestamptz) to authenticated;
create function public.crm_delete_unused_role(p_role text,p_expected_updated_at timestamptz) returns text language sql security invoker set search_path='' as $$select private.crm_delete_unused_role(p_role,p_expected_updated_at)$$;
revoke all on function public.crm_delete_unused_role(text,timestamptz) from public,anon;
grant execute on function public.crm_delete_unused_role(text,timestamptz) to authenticated;
notify pgrst,'reload schema';
