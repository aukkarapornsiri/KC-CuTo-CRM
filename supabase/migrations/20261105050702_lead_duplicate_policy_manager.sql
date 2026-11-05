-- Template keys, rather than policy names, determine the lead workflow.
create table public.crm_lead_duplicate_policies(
 id uuid primary key default gen_random_uuid(),template_key text not null check(template_key in ('contact_warning','same_owner_merge','cross_owner_merge')),
 name text not null check(length(trim(name)) between 1 and 160),details text not null default '' check(length(details)<=2000),
 approver_ids uuid[] not null default '{}',is_active boolean not null default true,legacy_reviewer boolean not null default false,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),check(cardinality(approver_ids)<=8));
create unique index crm_lead_duplicate_policy_active on public.crm_lead_duplicate_policies(template_key) where is_active;
alter table public.crm_lead_duplicate_policies enable row level security;
create policy crm_lead_duplicate_policy_read on public.crm_lead_duplicate_policies for select to authenticated using(private.crm_active_user() and (private.crm_can('leads','view') or private.crm_can('leads','create') or private.crm_can('leads','edit') or private.crm_can('settings','manage_settings')));
revoke all on public.crm_lead_duplicate_policies from public,anon,authenticated;grant select on public.crm_lead_duplicate_policies to authenticated;
insert into public.crm_lead_duplicate_policies(template_key,name,details,legacy_reviewer) values
 ('contact_warning','ผู้ติดต่อซ้ำ · คนละบริษัท','แจ้งเตือนเมื่อผู้ติดต่อ เบอร์โทร หรืออีเมลซ้ำ แต่เป็นคนละบริษัท และยืนยันบันทึกแยกได้',false),
 ('same_owner_merge','บริษัทซ้ำ · ผู้รับผิดชอบเดียวกัน','ชื่อบริษัทหรือเลขผู้เสียภาษีตรงกัน และผู้รับผิดชอบเดียวกัน ให้รวมลีดได้ทันที',false),
 ('cross_owner_merge','บริษัทซ้ำ · ผู้รับผิดชอบต่างคนกัน','ต้องขออนุมัติก่อนรวมลีด ตั้งลำดับผู้อนุมัติได้ที่แก้ไขนโยบาย ระหว่างนี้ยังใช้ผู้อนุมัติที่เลือกในคำขอ',true);
alter table public.crm_lead_resolutions add column merge_approver_ids uuid[];
alter table public.crm_lead_resolutions add column merge_current_step integer not null default 1;
alter table public.crm_lead_resolutions add column merge_policy_snapshot jsonb;
alter table public.crm_lead_resolutions add column merge_decisions jsonb not null default '[]';

create function private.crm_lead_policy_change(p_action text,p_id uuid,p_version integer,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare oldrow public.crm_lead_duplicate_policies;newrow public.crm_lead_duplicate_policies;ids uuid[];key text;active boolean;
begin
 if auth.uid() is null or not private.crm_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and is_super_admin) then raise insufficient_privilege;end if;
 if p_action not in ('save','toggle','delete') or p_action is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>10000 then raise exception 'Invalid policy action';end if;
 perform pg_advisory_xact_lock(867820);
 if p_id is not null then
  select * into oldrow from public.crm_lead_duplicate_policies where id=p_id for update;
  if not found or p_version is null or oldrow.version<>p_version then raise exception 'Policy changed; reload before saving / นโยบายเปลี่ยนแล้ว กรุณาโหลดใหม่';end if;
 elsif p_action<>'save' then raise exception 'Policy ID required';end if;
 if p_action='delete' then
  delete from public.crm_lead_duplicate_policies where id=p_id;
  insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'delete','settings',p_id,jsonb_build_object('lead_duplicate_policy',to_jsonb(oldrow),'permanent',true));
  return to_jsonb(oldrow);
 end if;
 if p_action='toggle' then
  newrow:=oldrow;newrow.is_active:=not oldrow.is_active;
 else
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('template_key','name','details','approver_ids','is_active')) then raise exception 'Unsupported policy field';end if;
  key:=p_data->>'template_key';
  if key not in ('contact_warning','same_owner_merge','cross_owner_merge') or key is null then raise exception 'Choose a connected approval template';end if;
  if jsonb_typeof(coalesce(p_data->'approver_ids','[]'))<>'array' then raise exception 'Invalid approver list';end if;
  select coalesce(array_agg(x::uuid order by ord),'{}') into ids from jsonb_array_elements_text(coalesce(p_data->'approver_ids','[]')) with ordinality a(x,ord);
  if cardinality(ids)>8 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or exists(select 1 from unnest(ids) x where x is null or not coalesce(private.crm_lead_assigner_eligible(x),false)) then raise exception 'Choose 1–8 distinct active authorized approvers';end if;
  if key<>'cross_owner_merge' and cardinality(ids)>0 then raise exception 'This template does not use approvers';end if;
  active:=coalesce((p_data->>'is_active')::boolean,false);
  if key='cross_owner_merge' and active and cardinality(ids)=0 then raise exception 'Select approvers before enabling this policy / เลือกผู้อนุมัติก่อนเปิดใช้นโยบาย';end if;
  newrow.id:=coalesce(p_id,gen_random_uuid());newrow.template_key:=key;newrow.name:=trim(p_data->>'name');newrow.details:=coalesce(p_data->>'details','');newrow.approver_ids:=ids;newrow.is_active:=active;newrow.legacy_reviewer:=false;
 end if;
 if newrow.is_active and exists(select 1 from public.crm_lead_duplicate_policies where template_key=newrow.template_key and is_active and id<>newrow.id) then raise exception 'An active policy already uses this template / Template นี้มีนโยบายใช้งานแล้ว กรุณาปิดรายการเดิมก่อน';end if;
 if newrow.is_active and newrow.template_key='cross_owner_merge' and cardinality(newrow.approver_ids)=0 and not newrow.legacy_reviewer then raise exception 'Select approvers before enabling';end if;
 newrow.version:=coalesce(oldrow.version,0)+1;newrow.updated_at:=clock_timestamp();
 insert into public.crm_lead_duplicate_policies values(newrow.*) on conflict(id) do update set template_key=excluded.template_key,name=excluded.name,details=excluded.details,approver_ids=excluded.approver_ids,is_active=excluded.is_active,legacy_reviewer=excluded.legacy_reviewer,version=excluded.version,updated_at=excluded.updated_at;
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),case when p_id is null then 'create' else 'update' end,'settings',newrow.id,jsonb_build_object('before',to_jsonb(oldrow),'after',to_jsonb(newrow),'kind','lead_duplicate_policy'));
 return to_jsonb(newrow);
end $$;
create function public.crm_lead_policy_change(p_action text,p_id uuid default null,p_version integer default null,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.crm_lead_policy_change(p_action,p_id,p_version,p_data)$$;
revoke all on function private.crm_lead_policy_change(text,uuid,integer,jsonb),public.crm_lead_policy_change(text,uuid,integer,jsonb) from public,anon;grant execute on function private.crm_lead_policy_change(text,uuid,integer,jsonb),public.crm_lead_policy_change(text,uuid,integer,jsonb) to authenticated;

create function public.crm_lead_duplicate_policy_state() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare state jsonb:='{}';k text;p public.crm_lead_duplicate_policies;
begin
 if auth.uid() is null or not private.crm_active_user() then raise insufficient_privilege;end if;
 foreach k in array array['contact_warning','same_owner_merge','cross_owner_merge'] loop
  select * into p from public.crm_lead_duplicate_policies where template_key=k and is_active;
  state:=state||jsonb_build_object(k,jsonb_build_object('enabled',found,'name',p.name,'configured',coalesce(cardinality(p.approver_ids)>0,false),'steps',coalesce(cardinality(p.approver_ids),0)));
 end loop;return state;
end $$;
revoke all on function public.crm_lead_duplicate_policy_state() from public,anon;grant execute on function public.crm_lead_duplicate_policy_state() to authenticated;
alter function public.crm_lead_duplicate_check(jsonb,uuid) set schema private;
alter function private.crm_lead_duplicate_check(jsonb,uuid) rename to crm_lead_duplicate_check_base;
create function public.crm_lead_duplicate_check(p_draft jsonb,p_exclude uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;state jsonb;matches jsonb;total integer;
begin
 result:=private.crm_lead_duplicate_check_base(p_draft,p_exclude);state:=public.crm_lead_duplicate_policy_state();
 if not (state->'contact_warning'->>'enabled')::boolean then
  select coalesce(jsonb_agg(m),'[]') into matches from jsonb_array_elements(result->'matches') m where (m->>'hard_duplicate')::boolean;
  select count(*) into total from public.leads l where l.id is distinct from p_exclude and private.crm_lead_company_duplicate(p_draft,to_jsonb(l)) and not exists(select 1 from public.crm_lead_resolutions r where r.action='merge' and r.source_id=l.id);
  result:=jsonb_set(jsonb_set(result,'{matches}',matches),'{total}',to_jsonb(total));
 end if;
 return result||jsonb_build_object('policy_state',state);
end $$;
revoke all on function private.crm_lead_duplicate_check_base(jsonb,uuid),public.crm_lead_duplicate_check(jsonb,uuid) from public,anon;grant execute on function private.crm_lead_duplicate_check_base(jsonb,uuid),public.crm_lead_duplicate_check(jsonb,uuid) to authenticated;

alter function private.crm_lead_merge_write(uuid,uuid,jsonb,text,uuid,uuid,uuid) rename to crm_lead_merge_write_base;
create function private.crm_lead_merge_write(p_target uuid,p_source uuid,p_incoming jsonb,p_reason text,p_request uuid,p_reviewer uuid,p_approval uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid;target_owner uuid;key text;p public.crm_lead_duplicate_policies;eid uuid;ids uuid[];snapshot jsonb;
begin
 if auth.uid() is null or not private.crm_active_user() or not(private.crm_can('leads','create') or private.crm_can('leads','edit')) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(867820);
 select id into eid from public.crm_lead_resolutions where actor_id=auth.uid() and request_id=p_request;if found then return eid;end if;
 if p_approval is not null then
  eid:=private.crm_lead_merge_write_base(p_target,p_source,p_incoming,p_reason,p_request,p_reviewer,p_approval);
  update public.crm_lead_resolutions r set merge_policy_snapshot=e.merge_policy_snapshot,merge_approver_ids=e.merge_approver_ids,merge_current_step=e.merge_current_step from public.crm_lead_resolutions e where r.id=eid and e.id=p_approval;
  return eid;
 end if;
 select owner_id into target_owner from public.leads where id=p_target for update;
 if p_source is not null then select owner_id into owner from public.leads where id=p_source for update;else owner:=nullif(p_incoming->>'owner_id','')::uuid;end if;
 key:=case when owner is not null and owner=target_owner then 'same_owner_merge' else 'cross_owner_merge' end;
 select * into p from public.crm_lead_duplicate_policies where template_key=key and is_active;
 if not found then raise exception 'This merge template is disabled; ask Super Admin / นโยบายรวมลีดนี้ปิดใช้งาน กรุณาติดต่อ Super Admin';end if;
 ids:=p.approver_ids;
 if key='cross_owner_merge' then
  if cardinality(ids)=0 and p.legacy_reviewer then ids:=array[p_reviewer];end if;
  if cardinality(ids)=0 or exists(select 1 from unnest(ids) x where x is null or x=auth.uid() or not coalesce(private.crm_lead_assigner_eligible(x),false)) then raise exception 'Independent active authorized approvers required / ต้องมีผู้อนุมัติที่มีสิทธิ์และไม่ใช่ผู้ส่งคำขอ';end if;
 end if;
 eid:=private.crm_lead_merge_write_base(p_target,p_source,p_incoming,p_reason,p_request,case when key='cross_owner_merge' then ids[1] else null end);
 update public.crm_lead_resolutions set merge_approver_ids=case when key='cross_owner_merge' then ids else '{}' end,merge_policy_snapshot=to_jsonb(p),merge_current_step=1 where id=eid;
 return eid;
end $$;
revoke all on function private.crm_lead_merge_write(uuid,uuid,jsonb,text,uuid,uuid,uuid),private.crm_lead_merge_write_base(uuid,uuid,jsonb,text,uuid,uuid,uuid) from public,anon,authenticated;

create or replace function private.crm_lead_merge_decide(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare e public.crm_lead_resolutions;ids uuid[];step integer;decision jsonb;eid uuid;
begin
 if auth.uid() is null or not private.crm_active_user() or not coalesce(private.crm_lead_assigner_eligible(auth.uid()),false) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(867820);select * into e from public.crm_lead_resolutions where id=p_id for update;
 if not found or e.reviewer_id is distinct from auth.uid() or e.actor_id=auth.uid() or e.merge_status is null then raise insufficient_privilege;end if;
 if e.merge_status<>'pending' then return;end if;if p_approve is null then raise exception 'Decision required';end if;
 ids:=coalesce(e.merge_approver_ids,array[e.reviewer_id]);step:=e.merge_current_step;
 if ids[step] is distinct from auth.uid() then raise insufficient_privilege;end if;
 decision:=jsonb_build_object('step',step,'actor_id',auth.uid(),'approved',p_approve,'at',clock_timestamp());
 if p_approve and step<cardinality(ids) then
  if not coalesce(private.crm_lead_assigner_eligible(ids[step+1]),false) or ids[step+1]=e.actor_id then raise exception 'Next approver is unavailable; contact Super Admin';end if;
  update public.crm_lead_resolutions set merge_current_step=step+1,reviewer_id=ids[step+1],merge_decisions=merge_decisions||jsonb_build_array(decision) where id=e.id;
  update public.notifications set resolved_at=coalesce(resolved_at,now()),resolution='approved_step' where user_id=auth.uid() and (event_key='lead-duplicate:'||e.id or event_key like 'lead-duplicate:'||e.id||':step:%');
  perform private.crm_notify_once(ids[step+1],'leads',e.target_id,'lead_duplicate','lead-duplicate:'||e.id||':step:'||(step+1),'ขออนุมัติรวมลีด · ขั้นที่ '||(step+1),e.reason,false);
  return;
 end if;
 if p_approve then eid:=private.crm_lead_merge_write(e.target_id,e.source_id,e.incoming,e.reason,e.id,auth.uid(),e.id);end if;
 update public.crm_lead_resolutions set merge_status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),resolved_at=now(),merge_decisions=merge_decisions||jsonb_build_array(decision) where id=e.id;
 if eid is not null then update public.crm_lead_resolutions set merge_decisions=e.merge_decisions||jsonb_build_array(decision) where id=eid;end if;
 update public.notifications set resolved_at=coalesce(resolved_at,now()),resolution=case when p_approve then 'approved' else 'rejected' end where event_key='lead-duplicate:'||e.id or event_key like 'lead-duplicate:'||e.id||':step:%';
 perform private.crm_notify_once(e.actor_id,'leads',e.target_id,'lead_duplicate','lead-duplicate-decision:'||e.id,case when p_approve then 'รวมลีดเรียบร้อยแล้ว' else 'คำขอรวมลีดถูกปฏิเสธ' end,e.reason,false);
end $$;

-- Refresh callers after replacing the named entry points, preserving any existing guards.
do $$begin
 execute pg_get_functiondef('public.crm_create_lead_checked(jsonb,text)'::regprocedure);
 execute pg_get_functiondef('private.crm_lead_resolve(uuid,uuid,text,jsonb,text,uuid,uuid)'::regprocedure);
end $$;
