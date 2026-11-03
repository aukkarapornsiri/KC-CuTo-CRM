-- User-requested cleanup: preserve every role referenced by any profile, including removed users.
-- System roles and all existing user assignments/permissions remain unchanged.
lock table public.profiles in share row exclusive mode;
lock table public.custom_roles in share row exclusive mode;
insert into public.audit_logs(user_id,action,module,changes)
select (select id from public.profiles where is_super_admin and is_active and deleted_at is null order by id limit 1),'delete','settings',jsonb_build_object('cleanup','unused_custom_roles','role',to_jsonb(r))
from public.custom_roles r where not r.is_system and not exists(select 1 from public.profiles p where p.role=r.role_key or p.custom_role_key=r.role_key);
delete from public.custom_roles r where not r.is_system and not exists(select 1 from public.profiles p where p.role=r.role_key or p.custom_role_key=r.role_key);
