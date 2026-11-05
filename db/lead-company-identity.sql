-- Company identity blocks new duplicate leads; shared contact details only warn.
create or replace function private.crm_lead_company_duplicate(a jsonb,b jsonb) returns boolean language sql immutable set search_path='' as $$
 select (private.crm_lead_norm(a->>'company_name','name')<>'' and private.crm_lead_norm(a->>'company_name','name')=private.crm_lead_norm(b->>'company_name','name'))
 or (regexp_replace(coalesce(a->>'tax_id',''),'[^0-9]','','g')~'^[0-9]{13}$' and regexp_replace(a->>'tax_id','[^0-9]','','g')=regexp_replace(b->>'tax_id','[^0-9]','','g'))
$$;
alter table public.crm_lead_resolutions add column merge_status text check(merge_status in ('pending','approved','rejected'));
alter table public.crm_lead_resolutions add column merge_owner_id uuid;
alter table public.crm_lead_resolutions add column merge_target_owner_id uuid;
alter table public.crm_lead_resolutions add column reviewed_by uuid references public.profiles(id);
alter table public.crm_lead_resolutions add column reviewed_at timestamptz;
create or replace function private.crm_lead_hidden_match(p_draft jsonb,p_exclude uuid,p_visible uuid[]) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 return exists(select 1 from public.leads l where l.id is distinct from p_exclude and not(l.id=any(p_visible)) and private.crm_lead_company_duplicate(p_draft,to_jsonb(l)) and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id));
end $$;
create or replace function public.crm_lead_duplicate_check(p_draft jsonb,p_exclude uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare matches jsonb;visible uuid[];total integer;
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 if length(p_draft::text)>65536 then raise exception 'Lead draft too large';end if;
 select coalesce(array_agg(l.id),'{}') into visible from public.leads l;
 select count(*) into total from public.leads l where l.id is distinct from p_exclude and (cardinality(private.crm_lead_match(p_draft,to_jsonb(l)))>0 or private.crm_lead_company_duplicate(p_draft,to_jsonb(l))) and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id);
 select coalesce(jsonb_agg(x),'[]') into matches from (select l.id,l.code,l.company_name,l.contact_name,l.owner_id,l.owner_name,private.crm_lead_company_duplicate(p_draft,to_jsonb(l)) hard_duplicate,l.status,l.customer_id,l.converted_contact_id,l.updated_at,private.crm_lead_match(p_draft,to_jsonb(l)) reasons,(select max(a.scheduled_at) from public.activities a where a.related_module='leads' and a.related_id=l.id and a.status='completed' and a.scheduled_at<=now()) last_contact from public.leads l where l.id is distinct from p_exclude and (cardinality(private.crm_lead_match(p_draft,to_jsonb(l)))>0 or private.crm_lead_company_duplicate(p_draft,to_jsonb(l))) and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id) order by private.crm_lead_company_duplicate(p_draft,to_jsonb(l)) desc,l.created_at desc,l.id limit 20) x;
 return jsonb_build_object('matches',matches,'total',total,'hidden',private.crm_lead_hidden_match(p_draft,p_exclude,visible));
end $$;
create or replace function public.crm_create_lead_checked(p_data jsonb,p_reason text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare checked jsonb;saved jsonb;cols text;vals text;k text;
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('leads','create') then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' or length(p_data::text)>65536 or length(p_reason)>2000 then raise exception 'Invalid lead draft';end if;
 perform pg_advisory_xact_lock(867820);
 checked:=public.crm_lead_duplicate_check(p_data,null);
 if (checked->>'hidden')::boolean or exists(select 1 from jsonb_array_elements(checked->'matches') m where (m->>'hard_duplicate')::boolean) or (jsonb_array_length(checked->'matches')>0 and length(trim(p_reason))=0) then return jsonb_build_object('duplicates',checked);end if;
 for k in select jsonb_object_keys(p_data) loop
  if k not in ('lead_type','tax_id','company_name','salutation','first_name','last_name','contact_name','position','phone','mobile','email','website','line_id','customer_id','source','product_interest','budget','score','status','priority','owner_id','owner_name','lead_assigner_id','mailing_country','mailing_street','mailing_street_th','mailing_street_en','mailing_city','mailing_state','mailing_postal_code','next_action','note') then raise exception 'Unsupported lead field: %',k;end if;
  cols:=concat_ws(',',cols,quote_ident(k));vals:=concat_ws(',',vals,'x.'||quote_ident(k));
 end loop;
 execute 'with saved as (insert into public.leads ('||cols||') select '||vals||' from jsonb_populate_record(null::public.leads,$1) x returning *) select to_jsonb(saved) from saved' into saved using p_data;
 return jsonb_build_object('saved',saved);
end $$;
revoke all on function public.crm_create_lead_checked(jsonb,text) from public,anon;grant execute on function public.crm_create_lead_checked(jsonb,text) to authenticated;


-- A trigger also guards direct/import writes. Existing records remain editable if identity is unchanged.
create or replace function private.crm_lead_company_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and private.crm_lead_norm(new.company_name,'name')=private.crm_lead_norm(old.company_name,'name') and regexp_replace(coalesce(new.tax_id,''),'[^0-9]','','g')=regexp_replace(coalesce(old.tax_id,''),'[^0-9]','','g') then return new;end if;
 perform pg_advisory_xact_lock(867820);
 if exists(select 1 from public.leads l where l.id<>new.id and private.crm_lead_company_duplicate(to_jsonb(new),to_jsonb(l)) and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id)) then raise exception 'Duplicate company or tax ID: merge with the existing lead; approval required for different sales owners';end if;
 return new;
end $$;
create trigger crm_lead_company_identity_guard before insert or update of company_name,tax_id on public.leads for each row execute function private.crm_lead_company_guard();

-- Merge retains every source row and incoming contact in the audit history; never reassign an owner.
create or replace function private.crm_lead_merge_write(p_target uuid,p_source uuid,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid,p_approval uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.leads;source public.leads;own uuid;eid uuid;state text;event_action text;snapshot jsonb;approval public.crm_lead_resolutions;
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 if p_request is null or jsonb_typeof(p_incoming)<>'object' or length(p_incoming::text)>65536 or length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Reason and valid request required';end if;
 perform pg_advisory_xact_lock(867820);
 select id into eid from public.crm_lead_resolutions where actor_id=auth.uid() and request_id=p_request;if found then return eid;end if;
 if not private.crm_can('leads','view') then raise insufficient_privilege;end if;
 select * into target from public.leads where id=p_target for update;if not found then raise exception 'Lead not found';end if;
 own:=nullif(p_incoming->>'owner_id','')::uuid;
 if p_source is not null then
  select * into source from public.leads where id=p_source for update;if not found or p_source=p_target then raise exception 'Source unavailable';end if;
  own:=source.owner_id;snapshot:=to_jsonb(source);
  if not private.crm_lead_company_duplicate(snapshot,to_jsonb(target)) then raise exception 'Different companies cannot be merged by shared contact';end if;
  if source.customer_id is not null and target.customer_id is not null and source.customer_id<>target.customer_id then raise exception 'Linked customer accounts differ; reconcile accounts first';end if;
 else
  snapshot:=p_incoming;
  if not private.crm_lead_company_duplicate(p_incoming,to_jsonb(target)) then raise exception 'Company identity changed; check again';end if;
 end if;
 if exists(select 1 from public.crm_lead_resolutions where action='merge' and (source_id=p_target or (p_source is not null and (source_id=p_source or (target_id=p_source and source_id is not null))))) then raise exception 'Already merged or merge chain; review the primary lead';end if;
 if p_approval is null then
  if own is distinct from auth.uid() and not private.crm_lead_assigner_eligible(auth.uid()) then raise insufficient_privilege;end if;
  if own is not null and own=target.owner_id then state:='approved';event_action:='merge';
  else
   if p_reviewer is null or p_reviewer=auth.uid() or not coalesce(private.crm_lead_assigner_eligible(p_reviewer),false) then raise exception 'Independent authorized reviewer required';end if;
   state:='pending';event_action:='review';
  end if;
 else
  select * into approval from public.crm_lead_resolutions where id=p_approval for update;
  if not found or approval.merge_status<>'pending' or approval.reviewer_id<>auth.uid() or not private.crm_lead_assigner_eligible(auth.uid()) or approval.target_id<>p_target or approval.source_id is distinct from p_source or approval.merge_owner_id is distinct from own or approval.merge_target_owner_id is distinct from target.owner_id then raise exception 'Approval or ownership changed; request review again';end if;
  state:='approved';event_action:='merge';
 end if;
 insert into public.crm_lead_resolutions(request_id,actor_id,target_id,source_id,action,reason,incoming,source_snapshot,reviewer_id,merge_status,merge_owner_id,merge_target_owner_id,resolved_at,reviewed_by,reviewed_at)
 values(p_request,auth.uid(),p_target,p_source,event_action,p_reason,p_incoming,snapshot,p_reviewer,state,own,target.owner_id,case when state='approved' then now() end,case when p_approval is not null then auth.uid() end,case when p_approval is not null then now() end) returning id into eid;
 perform private.crm_notify_once(case when state='pending' then p_reviewer else target.owner_id end,'leads',p_target,'lead_duplicate','lead-duplicate:'||eid,case when state='pending' then 'ขออนุมัติรวมลีด: ' else 'รวมลีดแล้ว: ' end||target.code,p_reason,false);
 return eid;
end $$;
create or replace function private.crm_lead_resolve(p_target uuid,p_source uuid,p_action text,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.leads;source public.leads;eid uuid;snapshot jsonb;recipient uuid;
begin
 if p_action='merge' then return private.crm_lead_merge_write(p_target,p_source,p_incoming,p_reason,p_request,p_reviewer);end if;
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
 if p_action='reopen' then
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

create or replace function public.crm_lead_merge_decide(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare e public.crm_lead_resolutions;
begin
 if auth.uid() is null or not private.crm_active_user() or not coalesce(private.crm_lead_assigner_eligible(auth.uid()),false) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(867820);
 select * into e from public.crm_lead_resolutions where id=p_id for update;
 if not found or e.reviewer_id<>auth.uid() or e.actor_id=auth.uid() or e.merge_status is null then raise insufficient_privilege;end if;
 if e.merge_status<>'pending' then return;end if;
 if p_approve is null then raise exception 'Decision required';end if;
 if p_approve then perform private.crm_lead_merge_write(e.target_id,e.source_id,e.incoming,e.reason,e.id,auth.uid(),e.id);end if;
 update public.crm_lead_resolutions set merge_status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),resolved_at=now() where id=e.id;
 update public.notifications set resolved_at=now(),resolution=case when p_approve then 'approved' else 'rejected' end where event_key='lead-duplicate:'||e.id;
 perform private.crm_notify_once(e.actor_id,'leads',e.target_id,'lead_duplicate','lead-duplicate-decision:'||e.id,case when p_approve then 'รวมลีดเรียบร้อยแล้ว' else 'คำขอรวมลีดถูกปฏิเสธ' end,e.reason,false);
end $$;
revoke all on function public.crm_lead_merge_decide(uuid,boolean) from public,anon;grant execute on function public.crm_lead_merge_decide(uuid,boolean) to authenticated;
create or replace function private.crm_lead_review_complete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.crm_lead_resolutions;l public.leads;
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('leads','view') then raise insufficient_privilege;end if;
 select * into e from public.crm_lead_resolutions where id=p_id for update;if e.merge_status='pending' then raise exception 'Use approve or reject for this merge request';end if;select * into l from public.leads where id=e.target_id;
 if not found or not coalesce((e.reviewer_id=auth.uid() or l.owner_id=auth.uid() or (private.crm_can('leads','assign') and private.crm_can('leads','edit'))),false) then raise insufficient_privilege;end if;
 update public.crm_lead_resolutions set resolved_at=coalesce(resolved_at,now()) where id=p_id;
 update public.notifications set resolved_at=coalesce(resolved_at,now()),resolution='completed' where event_key='lead-duplicate:'||p_id::text;
end $$;
revoke all on function private.crm_lead_company_duplicate(jsonb,jsonb) from public,anon;grant execute on function private.crm_lead_company_duplicate(jsonb,jsonb) to authenticated;
revoke all on function private.crm_lead_company_guard() from public,anon,authenticated;
revoke all on function private.crm_lead_merge_write(uuid,uuid,jsonb,text,uuid,uuid,uuid) from public,anon,authenticated;
-- Keep the REST entry point unprivileged; the private implementation verifies the assigned reviewer.
alter function public.crm_lead_merge_decide(uuid,boolean) set schema private;
revoke all on function private.crm_lead_merge_decide(uuid,boolean) from public,anon;
grant execute on function private.crm_lead_merge_decide(uuid,boolean) to authenticated;
create function public.crm_lead_merge_decide(p_id uuid,p_approve boolean) returns void language sql security invoker set search_path='' as $$ select private.crm_lead_merge_decide(p_id,p_approve) $$;
revoke all on function public.crm_lead_merge_decide(uuid,boolean) from public,anon;
grant execute on function public.crm_lead_merge_decide(uuid,boolean) to authenticated;
