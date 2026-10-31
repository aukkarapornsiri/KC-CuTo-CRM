create or replace function private.crm_lead_resolve(p_target uuid,p_source uuid,p_action text,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.leads;source public.leads;eid uuid;snapshot jsonb;recipient uuid;
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 or length(p_incoming::text)>65536 or p_request is null then raise exception 'Reason and valid request required';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||p_request::text));
 select id into eid from public.crm_lead_resolutions where actor_id=auth.uid() and request_id=p_request;if found then return eid;end if;
 if p_action='review' then
  if not coalesce(private.crm_lead_assigner_eligible(p_reviewer),false) then raise exception 'Authorized reviewer required';end if;
  select * into target from public.leads l where l.id is distinct from p_source and cardinality(private.crm_lead_match(p_incoming,to_jsonb(l)))>0 and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id) order by l.created_at desc limit 1;
  if not found then raise exception 'Match changed; check again';end if;
 else
  if not private.crm_can('leads','view') then raise insufficient_privilege;end if;
  select * into target from public.leads where id=p_target for update;if not found then raise exception 'Lead not found';end if;
  if p_action<>'separate' and cardinality(private.crm_lead_match(p_incoming,to_jsonb(target)))=0 then raise exception 'Match changed; check again';end if;
 end if;
 if p_action='merge' then
  if not private.crm_can('leads','edit') or not private.crm_can('leads','assign') or p_source is null or p_source=target.id then raise insufficient_privilege;end if;
  select * into source from public.leads where id=p_source for update;if not found then raise exception 'Source unavailable';end if;
  if cardinality(private.crm_lead_match(to_jsonb(source),to_jsonb(target)))=0 then raise exception 'Source does not match';end if;
  if source.customer_id is not null and target.customer_id is not null and source.customer_id<>target.customer_id then raise exception 'Different customer accounts require review';end if;
  if exists(select 1 from public.crm_lead_resolutions where action='merge' and (source_id in (p_source,target.id) or target_id=p_source)) then raise exception 'Already merged or merge chain; review the primary lead';end if;
  snapshot:=to_jsonb(source);
 elsif p_action='reopen' then
  if not private.crm_can('leads','edit') or target.status not in ('disqualified','lost','closed') then raise exception 'Lead cannot be reopened';end if;
  update public.leads set status='follow',updated_at=now() where id=target.id;
 elsif p_action in ('activity','opportunity','contact') then
  if not private.crm_can(case p_action when 'activity' then 'activities' when 'opportunity' then 'opportunities' else 'contacts' end,'create') then raise insufficient_privilege;end if;
 end if;
 insert into public.crm_lead_resolutions(request_id,actor_id,target_id,source_id,action,reason,incoming,source_snapshot,reviewer_id)
 values(p_request,auth.uid(),target.id,p_source,p_action,p_reason,p_incoming,snapshot,p_reviewer) returning id into eid;
 recipient:=case when p_action='review' then p_reviewer else target.owner_id end;
 perform private.crm_notify_once(recipient,'leads',target.id,'lead_duplicate','lead-duplicate:'||eid,'ลีดติดต่อซ้ำ / Returning lead: '||target.code,p_reason,false);
 return eid;
end $$;
create or replace function private.crm_lead_review_complete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.crm_lead_resolutions;l public.leads;
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('leads','view') then raise insufficient_privilege;end if;
 select * into e from public.crm_lead_resolutions where id=p_id for update;select * into l from public.leads where id=e.target_id;
 if not found or not coalesce((e.reviewer_id=auth.uid() or l.owner_id=auth.uid() or (private.crm_can('leads','assign') and private.crm_can('leads','edit'))),false) then raise insufficient_privilege;end if;
 update public.crm_lead_resolutions set resolved_at=coalesce(resolved_at,now()) where id=p_id;
 update public.notifications set resolved_at=coalesce(resolved_at,now()),resolution='completed' where event_key='lead-duplicate:'||p_id::text;
end $$;