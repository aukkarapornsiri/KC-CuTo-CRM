-- Additive configuration. Existing request snapshots and business documents are retained.
alter table public.crm_approval_policies add column request_type text not null default 'quotation' check(request_type in ('quotation','so','amendment'));
create function private.crm_flow_eligible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.crm_active_user(p_user) and exists(select 1 from public.profiles p left join public.role_permissions r on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module='quotations' where p.id=p_user and (p.is_super_admin or (coalesce(r.can_view,false) and coalesce(r.can_approve,false))))
$$;
revoke all on function private.crm_flow_eligible(uuid) from public,anon,authenticated;
create function private.crm_flow_approvers() returns table(id uuid,display_name text,email text,role_key text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 return query select p.id,p.display_name,p.email,case when p.role='custom' then p.custom_role_key else p.role end from public.profiles p where private.crm_flow_eligible(p.id) order by p.display_name,p.email;
end $$;
revoke all on function private.crm_flow_approvers() from public,anon;
grant execute on function private.crm_flow_approvers() to authenticated;
create function public.crm_flow_approvers() returns table(id uuid,display_name text,email text,role_key text) language sql security invoker set search_path='' as $$select * from private.crm_flow_approvers()$$;
revoke all on function public.crm_flow_approvers() from public,anon;
grant execute on function public.crm_flow_approvers() to authenticated;
create or replace function private.crm_policy_validate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 if cardinality(new.approver_ids) not between 1 and 8 or cardinality(new.approver_ids)<>(select count(distinct x) from unnest(new.approver_ids) x) then raise exception 'Select 1–8 distinct approvers in order';end if;
 if exists(select 1 from unnest(new.approver_ids) x where not private.crm_flow_eligible(x)) then raise exception 'Every approver must be active and have approval permission';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function private.crm_policy_validate() from public,anon,authenticated;
-- Quotation policy selection remains amount-based, scoped to its document type.
do $$declare source text;begin
 select pg_get_functiondef('private.crm_approval_transition(uuid,text,text)'::regprocedure) into source;
 if position('WHERE is_active AND minimum_amount<=q.total' in source)=0 then raise exception 'Unexpected quotation transition definition';end if;
 source:=replace(source,'WHERE is_active AND minimum_amount<=q.total','WHERE request_type=''quotation'' AND is_active AND minimum_amount<=q.total');
 execute source;
end $$;
alter table public.crm_so_approvals add column approver_ids uuid[],add column current_step integer not null default 1 check(current_step between 1 and 8);
alter table public.crm_so_amendments add column approver_ids uuid[],add column current_step integer not null default 1 check(current_step between 1 and 8);
-- A request captures its route once. Settings changes never rewrite existing requests.
create function private.crm_flow_route() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text:=case when tg_table_name='crm_so_approvals' then 'so' else 'amendment' end;
 s public.crm_sales_orders; route uuid[];begin
 if tg_op='INSERT' or (tg_op='UPDATE' and new.status='pending' and old.status<>'pending') then
  select * into s from public.crm_sales_orders where id=new.sales_order_id;
  select p.approver_ids into route from public.crm_approval_policies p where p.request_type=kind and p.is_active and p.minimum_amount<=s.total order by p.minimum_amount desc,p.id limit 1;
  if route is null then raise exception 'Super Admin must configure an approval flow for this request type and amount';end if;
  if new.requested_by=any(route) then raise exception 'The requester cannot be an approver in this flow';end if;
  if exists(select 1 from unnest(route) x where not private.crm_flow_eligible(x)) then raise exception 'Configured approver is no longer eligible';end if;
  new.approver_ids:=route;new.current_step:=1;
 elsif tg_op='UPDATE' then
  if new.approver_ids is distinct from old.approver_ids or new.current_step<>old.current_step then raise exception 'Approval route is immutable';end if;
  if old.status='pending' and new.status in ('approved','rejected') and old.approver_ids is not null then
   if auth.uid() is distinct from old.approver_ids[old.current_step] or not private.crm_flow_eligible(auth.uid()) then raise insufficient_privilege using message='Not the current configured approver';end if;
   if new.status='approved' and old.current_step<cardinality(old.approver_ids) then
    new.status:='pending';new.current_step:=old.current_step+1;new.reviewed_by:=null;new.reviewed_at:=null;
    if tg_table_name='crm_so_approvals' then new.signature_storage_key:=null;new.reviewer_name:=null;end if;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.crm_flow_route() from public,anon,authenticated;
create trigger crm_flow_route before insert or update on public.crm_so_approvals for each row execute function private.crm_flow_route();
create trigger crm_flow_route before insert or update on public.crm_so_amendments for each row execute function private.crm_flow_route();
-- Only the current configured step is notified. Legacy requests keep their former route.
create function private.crm_flow_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.crm_sales_orders;kind text:=case when tg_table_name='crm_so_approvals' then 'so' else 'amendment' end;key text;dest uuid;begin
 if tg_op='UPDATE' and new.status=old.status and new.current_step=old.current_step then return new;end if;
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 key:='flow:'||kind||':'||case when kind='so' then new.sales_order_id::text||':'||(to_jsonb(new)->>'revision') else to_jsonb(new)->>'id' end;
 update public.notifications set resolved_at=clock_timestamp(),resolution=case when new.status='pending' then 'step_completed' else new.status end where resolved_at is null and event_key like key||':%';
 if new.status='pending' then
  if new.approver_ids is not null then
   dest:=new.approver_ids[new.current_step];
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority) values(dest,'approval',case when kind='so' then 'SO approval requested • ' else 'Request SO amendment • ' end||s.code,'Step '||new.current_step||' / '||cardinality(new.approver_ids),'quotations',s.quotation_id,key||':step:'||new.current_step,'approval_requested','high') on conflict do nothing;
  else
   for dest in select p.id from public.profiles p where private.crm_flow_eligible(p.id) and p.id<>new.requested_by loop
    insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority) values(dest,'approval','SO approval requested • '||s.code,'Legacy request','quotations',s.quotation_id,key||':legacy:'||dest,'approval_requested','high') on conflict do nothing;
   end loop;
  end if;
 else
  insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority) values(new.requested_by,'approval','SO '||kind||' '||new.status||' • '||s.code,coalesce(new.review_note,''),'quotations',s.quotation_id,key||':'||new.status,'approval_resolved','high') on conflict do nothing;
 end if;return new;
end $$;
revoke all on function private.crm_flow_notify() from public,anon,authenticated;
drop trigger if exists crm_so_approval_notify_change on public.crm_so_approvals;
drop trigger if exists crm_so_amendment_notify on public.crm_so_amendments;
create trigger crm_flow_notify after insert or update on public.crm_so_approvals for each row execute function private.crm_flow_notify();
create trigger crm_flow_notify after insert or update on public.crm_so_amendments for each row execute function private.crm_flow_notify();
notify pgrst,'reload schema';
