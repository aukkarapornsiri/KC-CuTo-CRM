-- Optional document profit escalation; existing pending routes and disabled policies are unchanged.
alter table public.crm_approval_policies add column low_gp_amount numeric(18,2);
alter table public.crm_approval_policies drop constraint crm_quotation_low_gp_condition;
alter table public.crm_approval_policies add constraint crm_quotation_low_gp_condition check (
 (low_gp_threshold is null and low_gp_amount is null and cardinality(low_gp_approver_ids)=0)
 or (request_type in ('quotation','so') and (low_gp_threshold is not null or low_gp_amount is not null)
 and (low_gp_threshold is null or low_gp_threshold between 0 and 100)
 and (low_gp_amount is null or low_gp_amount between 0 and 9999999999999999.99)
 and cardinality(low_gp_approver_ids) between 1 and 8));
create function private.crm_profit_below(gp numeric,margin numeric,net numeric,pct numeric,amount numeric)
returns boolean language sql immutable set search_path='' as $$
 select case when pct is null and amount is null then false
 else coalesce(net<=0,false) or (pct is not null and (margin is null or margin<pct))
 or (amount is not null and (gp is null or gp<amount)) end
$$;
revoke all on function private.crm_profit_below(numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.crm_quotation_gp_policy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.crm_is_super_admin() then raise insufficient_privilege;end if;
 if new.low_gp_threshold is not null or new.low_gp_amount is not null then
  if exists(select 1 from unnest(new.low_gp_approver_ids) x where x is null or not coalesce(private.crm_flow_eligible(x),false))
   or cardinality(new.low_gp_approver_ids)<>(select count(distinct x) from unnest(new.low_gp_approver_ids) x)
   or exists(select 1 from unnest(new.low_gp_approver_ids) x where x=any(new.approver_ids))
   or cardinality(new.approver_ids)+cardinality(new.low_gp_approver_ids)>8
  then raise exception 'Select distinct eligible additional approvers; combined route cannot exceed 8 steps';end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_quotation_gp_route()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quotations;p public.crm_approval_policies;f public.crm_quotation_financials;low boolean;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into q from public.quotations where id=new.quotation_id;
 select * into p from public.crm_approval_policies where request_type='quotation' and is_active and deleted_at is null and minimum_amount<=q.total order by minimum_amount desc,id limit 1 for share;
 -- Disabled conditions preserve the original route and existing submissions.
 if p.id is null or (p.low_gp_threshold is null and p.low_gp_amount is null) then return new;end if;
 if new.approver_ids is distinct from p.approver_ids then raise exception 'Quotation approval route changed; submit again';end if;
 select * into f from public.crm_quotation_financials where quotation_id=q.id;
 if not found then raise exception 'Quotation financial summary is missing; save the quotation before submitting';end if;
 -- Zero/negative revenue has no meaningful margin denominator and must be reviewed.
 low:=private.crm_profit_below(f.gp_amount,f.gp_margin,f.gp_amount+f.cost_total,p.low_gp_threshold,p.low_gp_amount);
 if low then
  if new.submitted_by=any(p.low_gp_approver_ids) or q.owner_id=any(p.low_gp_approver_ids)
   then raise exception 'Requester and sales owner cannot approve a low GP quotation';end if;
  if exists(select 1 from unnest(p.low_gp_approver_ids) x where not coalesce(private.crm_flow_eligible(x),false))
   then raise exception 'A low GP approver is no longer eligible; contact Super Admin';end if;
  new.approver_ids:=new.approver_ids||p.low_gp_approver_ids;
 end if;
 -- Do not copy confidential GP amounts into the general quotation snapshot.
 new.snapshot:=new.snapshot||jsonb_build_object('approval_conditions',jsonb_build_object(
  'policy_id',p.id,'policy_name',p.name,'low_gp_applied',low,'low_gp_threshold',p.low_gp_threshold,'low_gp_amount',p.low_gp_amount,
  'base_steps',cardinality(p.approver_ids),'additional_steps',case when low then cardinality(p.low_gp_approver_ids) else 0 end,
  'no_margin_base',f.gp_amount+f.cost_total<=0));
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_so_configured_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;p public.crm_approval_policies;u uuid:=auth.uid();who uuid;sig text;f public.crm_sales_order_cost_sheets;
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
  if tg_table_name='crm_so_approvals' and (p.low_gp_threshold is not null or p.low_gp_amount is not null) then
   select * into f from public.crm_sales_order_cost_sheets where sales_order_id=s.id;
   if not found then raise exception 'SO financial summary is missing; save before submitting';end if;
   if private.crm_profit_below(f.gp_amount,f.gp_margin,f.gp_amount+f.cost_total,p.low_gp_threshold,p.low_gp_amount) then
    p.approver_ids:=p.approver_ids||p.low_gp_approver_ids;
   end if;
  end if;
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
end $function$
;
notify pgrst,'reload schema';

