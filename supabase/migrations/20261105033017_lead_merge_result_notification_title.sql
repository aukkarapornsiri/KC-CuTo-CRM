-- Result notices must not appear as new pending approval requests.
create or replace function private.crm_lead_merge_decide(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
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
