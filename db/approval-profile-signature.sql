-- Capture the current approver's Profile signature at the moment of approval.
-- Existing approval history is deliberately not backfilled.
alter table public.crm_approval_events add column if not exists signature_storage_key text;
alter table public.crm_approval_events add column if not exists reviewer_name text;
create or replace function private.crm_approval_capture_signature() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); k text; r public.crm_approval_requests;
begin
 if tg_op='UPDATE' then
  new.signature_storage_key:=old.signature_storage_key;
  new.reviewer_name:=old.reviewer_name;
  return new;
 end if;
 new.signature_storage_key:=null;new.reviewer_name:=null;
 if new.decision='approve' then
  select * into r from public.crm_approval_requests where id=new.request_id;
  if u is null or not private.crm_active_user() or not private.crm_can('quotations','approve')
   or new.actor_id is distinct from u or r.approver_ids[new.step] is distinct from u then
   raise exception 'Quotation approve permission required' using errcode='42501';
  end if;
  select storage_key into k from public.crm_sales_signature_defaults where user_id=u for share;
  if coalesce(k,'')='' or split_part(k,'/',1)<>u::text or not exists(select 1 from storage.objects where bucket_id='crm-quotation-assets' and name=k) then
   raise exception 'กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ / Save your signature in Profile before approving';
  end if;
  new.signature_storage_key:=k;
  select coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),nullif(display_name,''),email) into new.reviewer_name from public.profiles where id=u;
 end if;
 return new;
end $$;
revoke all on function private.crm_approval_capture_signature() from public,anon,authenticated;
create trigger crm_approval_capture_signature before insert or update on public.crm_approval_events for each row execute function private.crm_approval_capture_signature();
notify pgrst,'reload schema';
