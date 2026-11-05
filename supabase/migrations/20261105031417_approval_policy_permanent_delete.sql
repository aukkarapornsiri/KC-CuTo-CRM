-- Remove policy records permanently while retaining the already captured approval sequences.
CREATE OR REPLACE FUNCTION private.crm_so_configured_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;p public.crm_approval_policies;u uuid:=auth.uid();who uuid;sig text;
begin
 -- FK ON DELETE SET NULL may only detach the policy pointer; retain every request snapshot.
 if tg_op='UPDATE' and pg_trigger_depth()>1 and new.approval_policy_id is null and old.approval_policy_id is not null
 and (to_jsonb(new)-'approval_policy_id')=(to_jsonb(old)-'approval_policy_id') then return new;end if;
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 if not found then raise exception 'Sales order not found';end if;
 if new.status='pending' and (tg_op='INSERT' or old.status<>'pending' or cardinality(old.approver_ids)=0
   or (tg_table_name='crm_so_approvals' and (to_jsonb(new)->>'revision') is distinct from (to_jsonb(old)->>'revision'))) then
  select * into p from public.crm_approval_policies where request_type=case when tg_table_name='crm_so_approvals' then 'so' else 'amendment' end and is_active and minimum_amount<=s.total
   order by minimum_amount desc,id limit 1;
  if not found then raise exception 'No approval policy configured / กรุณาให้ Super Admin ตั้งค่าขั้นตอนอนุมัติ';end if;
  if new.requested_by=any(p.approver_ids) or s.owner_id=any(p.approver_ids) then
   raise insufficient_privilege using message='Requester and SO owner cannot approve their own document / ผู้ขอและเจ้าของ SO อนุมัติเองไม่ได้';
  end if;
  if exists(select 1 from unnest(p.approver_ids) x where not exists(
   select 1 from public.profiles f left join public.role_permissions r
   on r.role_key=case when f.role='custom' then f.custom_role_key else f.role end and r.module='quotations'
   where f.id=x and f.is_active and f.deleted_at is null and (f.is_super_admin or coalesce(r.can_approve,false))
  )) then raise exception 'Configured approvers must be active and have approval permission';end if;
  new.approval_policy_id:=p.id;new.approval_policy_name:=p.name;new.approver_ids:=p.approver_ids;new.current_step:=1;
  new.approval_history:=case when tg_op='INSERT' then '[]'::jsonb else old.approval_history end;
 elsif tg_op='UPDATE' and old.status='pending' then
  new.approval_policy_id:=old.approval_policy_id;new.approval_policy_name:=old.approval_policy_name;
  new.approver_ids:=old.approver_ids;new.current_step:=old.current_step;new.approval_history:=old.approval_history;
  if new.status in ('approved','rejected') then
   who:=old.approver_ids[old.current_step];
   if u is null or who is distinct from u or new.reviewed_by is distinct from u
    or u=new.requested_by or u=s.owner_id or not private.crm_active_user()
    or not private.crm_can('quotations','view') or not private.crm_can('quotations','approve') then
    raise insufficient_privilege using message='Only the configured current approver may review this step';
   end if;
   if tg_table_name='crm_so_approvals' and new.status='approved' then
    select storage_key into sig from public.crm_sales_signature_defaults where user_id=u for share;
    if coalesce(sig,'')='' or not exists(select 1 from storage.objects where bucket_id='crm-quotation-assets' and name=sig) then
     raise exception 'Save your signature in Profile before approving / กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ';
    end if;
   end if;
   new.approval_history:=old.approval_history||jsonb_build_array(jsonb_build_object(
    'step',old.current_step,'actor_id',u,'decision',new.status,'note',new.review_note,
    'at',clock_timestamp(),'revision',to_jsonb(new)->'revision','policy_id',old.approval_policy_id,'signature_storage_key',sig));
   if new.status='approved' and old.current_step<cardinality(old.approver_ids) then
    new.current_step:=old.current_step+1;new.status:='pending';new.reviewed_by:=null;new.reviewed_at:=null;new.review_note:='';
   end if;
  end if;
 end if;
 return new;
end $function$;

alter table public.crm_so_approvals drop constraint crm_so_approvals_approval_policy_id_fkey;
alter table public.crm_so_approvals add constraint crm_so_approvals_approval_policy_id_fkey foreign key(approval_policy_id) references public.crm_approval_policies(id) on delete set null;
alter table public.crm_so_amendments drop constraint crm_so_amendments_approval_policy_id_fkey;
alter table public.crm_so_amendments add constraint crm_so_amendments_approval_policy_id_fkey foreign key(approval_policy_id) references public.crm_approval_policies(id) on delete set null;
create or replace function private.crm_archive_approval_flow(p_id uuid,p_expected_updated_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare row public.crm_approval_policies;begin
 if not private.crm_is_super_admin() then raise insufficient_privilege using message='Super Admin required';end if;
 select * into row from public.crm_approval_policies where id=p_id for update;
 if not found then return p_id;end if;
 if p_expected_updated_at is null or row.updated_at is distinct from p_expected_updated_at then raise exception 'Approval flow changed; reload before deleting';end if;
 delete from public.crm_approval_policies where id=row.id;
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'delete','settings',row.id,jsonb_build_object('approval_policy',to_jsonb(row),'permanent',true));
 return row.id;
end $$;
revoke delete on public.crm_approval_policies from authenticated;
-- User-requested cleanup: only policies already marked deleted, never inactive policies.
do $cleanup$ declare actor uuid;previous_claim text:=current_setting('request.jwt.claim.sub',true);r record;begin
 select id into actor from public.profiles where is_super_admin and is_active and deleted_at is null order by id limit 1;
 if actor is null and exists(select 1 from public.crm_approval_policies where deleted_at is not null) then raise exception 'Active Super Admin required for cleanup';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 for r in select id,updated_at from public.crm_approval_policies where deleted_at is not null loop
  perform private.crm_archive_approval_flow(r.id,r.updated_at);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
end $cleanup$;
notify pgrst,'reload schema';
