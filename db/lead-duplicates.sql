-- Additive audit and explicit resolution. No historical lead is rewritten or deleted.
-- Notification completion is updated below to keep returning enquiries pending independently of old lead status.
create function private.crm_lead_norm(v text,kind text) returns text language plpgsql immutable set search_path='' as $$
declare s text:=lower(trim(normalize(coalesce(v,''),NFKC)));
begin
 if kind='phone' then s:=regexp_replace(s,'[^0-9]','','g');if length(s)=11 and left(s,2)='66' then s:='0'||substr(s,3);end if;
 elsif kind='name' then s:=regexp_replace(s,'[[:space:][:punct:]]','','g');end if;return s;
end $$;
create function private.crm_lead_match(a jsonb,b jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare reasons text[]:='{}';an text;bn text;
begin
 if coalesce(a->>'tax_id','')~'^[0-9]{13}$' and a->>'tax_id'=b->>'tax_id' then reasons:=array_append(reasons,'tax_id');end if;
 if private.crm_lead_norm(a->>'email','email')<>'' and private.crm_lead_norm(a->>'email','email')=private.crm_lead_norm(b->>'email','email') then reasons:=array_append(reasons,'email');end if;
 if exists(select 1 from unnest(array[a->>'phone',a->>'mobile']) x cross join unnest(array[b->>'phone',b->>'mobile']) y where length(private.crm_lead_norm(x,'phone'))>=7 and private.crm_lead_norm(x,'phone')=private.crm_lead_norm(y,'phone')) then reasons:=array_append(reasons,'phone');end if;
 an:=private.crm_lead_norm(coalesce(nullif(a->>'contact_name',''),concat_ws(' ',a->>'first_name',a->>'last_name')),'name');bn:=private.crm_lead_norm(coalesce(nullif(b->>'contact_name',''),concat_ws(' ',b->>'first_name',b->>'last_name')),'name');
 if length(an)>=4 and length(bn)>=4 and (strpos(an,bn)>0 or strpos(bn,an)>0) then reasons:=array_append(reasons,'name');end if;
 an:=private.crm_lead_norm(a->>'company_name','name');bn:=private.crm_lead_norm(b->>'company_name','name');if length(an)>=4 and length(bn)>=4 and (strpos(an,bn)>0 or strpos(bn,an)>0) then reasons:=array_append(reasons,'company');end if;
 return reasons;
end $$;
create table public.crm_lead_resolutions(id uuid primary key default gen_random_uuid(),request_id uuid not null,actor_id uuid not null references public.profiles(id),target_id uuid references public.leads(id),source_id uuid references public.leads(id),action text not null check(action in ('activity','opportunity','contact','reopen','merge','review','separate')),reason text not null check(length(trim(reason)) between 1 and 2000),incoming jsonb not null default '{}',source_snapshot jsonb,reviewer_id uuid references public.profiles(id),resolved_at timestamptz,created_at timestamptz not null default now(),unique(actor_id,request_id));
create unique index crm_lead_merge_source on public.crm_lead_resolutions(source_id) where action='merge';
create index crm_lead_resolution_target on public.crm_lead_resolutions(target_id,created_at desc);
alter table public.crm_lead_resolutions enable row level security;
create policy crm_lead_resolutions_read on public.crm_lead_resolutions for select to authenticated using(private.crm_active_user() and private.crm_can('leads','view') and exists(select 1 from public.leads l where l.id=target_id or l.id=source_id));
revoke all on public.crm_lead_resolutions from public,anon,authenticated;grant select on public.crm_lead_resolutions to authenticated;
-- Only a boolean is returned for rows outside existing lead visibility.
create function private.crm_lead_hidden_match(p_draft jsonb,p_exclude uuid,p_visible uuid[]) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 return exists(select 1 from public.leads l where l.id is distinct from p_exclude and not(l.id=any(p_visible)) and cardinality(private.crm_lead_match(p_draft,to_jsonb(l)))>0 and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id));
end $$;
create function public.crm_lead_duplicate_check(p_draft jsonb,p_exclude uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare matches jsonb;visible uuid[];total integer;
begin
 if auth.uid() is null or not private.crm_active_user() or not (private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 if length(p_draft::text)>65536 then raise exception 'Lead draft too large';end if;
 select coalesce(array_agg(l.id),'{}') into visible from public.leads l;
 select count(*) into total from public.leads l where l.id is distinct from p_exclude and cardinality(private.crm_lead_match(p_draft,to_jsonb(l)))>0 and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id);
 select coalesce(jsonb_agg(x),'[]') into matches from (select l.id,l.code,l.company_name,l.contact_name,l.owner_name,l.status,l.customer_id,l.converted_contact_id,l.updated_at,private.crm_lead_match(p_draft,to_jsonb(l)) reasons,(select max(a.scheduled_at) from public.activities a where a.related_module='leads' and a.related_id=l.id and a.status='completed' and a.scheduled_at<=now()) last_contact from public.leads l where l.id is distinct from p_exclude and cardinality(private.crm_lead_match(p_draft,to_jsonb(l)))>0 and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id) order by l.created_at desc,l.id limit 20) x;
 return jsonb_build_object('matches',matches,'total',total,'hidden',private.crm_lead_hidden_match(p_draft,p_exclude,visible));
end $$;
-- Privileged implementation writes only an audit event, explicit reopen, and deduplicated notice.
-- Existing leads RLS grants visibility via crm_can('leads','view'); retain that boundary.
create function private.crm_lead_resolve(p_target uuid,p_source uuid,p_action text,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
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
create function public.crm_lead_resolve(p_target uuid,p_source uuid,p_action text,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.crm_lead_resolve(p_target,p_source,p_action,p_incoming,p_reason,p_request,p_reviewer)$$;
revoke all on function private.crm_lead_norm(text,text),private.crm_lead_match(jsonb,jsonb),private.crm_lead_hidden_match(jsonb,uuid,uuid[]),private.crm_lead_resolve(uuid,uuid,text,jsonb,text,uuid,uuid),public.crm_lead_duplicate_check(jsonb,uuid),public.crm_lead_resolve(uuid,uuid,text,jsonb,text,uuid,uuid) from public,anon;
grant execute on function private.crm_lead_norm(text,text),private.crm_lead_match(jsonb,jsonb),private.crm_lead_hidden_match(jsonb,uuid,uuid[]),private.crm_lead_resolve(uuid,uuid,text,jsonb,text,uuid,uuid),public.crm_lead_duplicate_check(jsonb,uuid),public.crm_lead_resolve(uuid,uuid,text,jsonb,text,uuid,uuid) to authenticated;
create function private.crm_lead_review_complete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.crm_lead_resolutions;l public.leads;
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('leads','view') then raise insufficient_privilege;end if;
 select * into e from public.crm_lead_resolutions where id=p_id for update;select * into l from public.leads where id=e.target_id;
 if not found or not coalesce((e.reviewer_id=auth.uid() or l.owner_id=auth.uid() or (private.crm_can('leads','assign') and private.crm_can('leads','edit'))),false) then raise insufficient_privilege;end if;
 update public.crm_lead_resolutions set resolved_at=coalesce(resolved_at,now()) where id=p_id;
 update public.notifications set resolved_at=coalesce(resolved_at,now()),resolution='completed' where event_key='lead-duplicate:'||p_id::text;
end $$;
create function public.crm_lead_review_complete(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.crm_lead_review_complete(p_id)$$;
revoke all on function private.crm_lead_review_complete(uuid),public.crm_lead_review_complete(uuid) from public,anon;
grant execute on function private.crm_lead_review_complete(uuid),public.crm_lead_review_complete(uuid) to authenticated;
create function public.crm_create_lead_checked(p_data jsonb,p_reason text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare checked jsonb;saved jsonb;cols text;vals text;k text;
begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('leads','create') then raise insufficient_privilege;end if;
 if jsonb_typeof(p_data)<>'object' or length(p_data::text)>65536 or length(p_reason)>2000 then raise exception 'Invalid lead draft';end if;
 perform pg_advisory_xact_lock(867820);
 checked:=public.crm_lead_duplicate_check(p_data,null);
 if (checked->>'hidden')::boolean or (jsonb_array_length(checked->'matches')>0 and length(trim(p_reason))=0) then return jsonb_build_object('duplicates',checked);end if;
 for k in select jsonb_object_keys(p_data) loop
  if k not in ('lead_type','tax_id','company_name','salutation','first_name','last_name','contact_name','position','phone','mobile','email','website','line_id','customer_id','source','product_interest','budget','score','status','priority','owner_id','owner_name','lead_assigner_id','mailing_country','mailing_street','mailing_street_th','mailing_street_en','mailing_city','mailing_state','mailing_postal_code','next_action','note') then raise exception 'Unsupported lead field: %',k;end if;
  cols:=concat_ws(',',cols,quote_ident(k));vals:=concat_ws(',',vals,'x.'||quote_ident(k));
 end loop;
 execute 'with saved as (insert into public.leads ('||cols||') select '||vals||' from jsonb_populate_record(null::public.leads,$1) x returning *) select to_jsonb(saved) from saved' into saved using p_data;
 return jsonb_build_object('saved',saved);
end $$;
revoke all on function public.crm_create_lead_checked(jsonb,text) from public,anon;grant execute on function public.crm_create_lead_checked(jsonb,text) to authenticated;

CREATE OR REPLACE FUNCTION private.crm_notification_done(n notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case
 when n.event_kind='lead_duplicate' then exists(select 1 from public.crm_lead_resolutions r where 'lead-duplicate:'||r.id::text=n.event_key and r.resolved_at is not null)
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
$function$;
