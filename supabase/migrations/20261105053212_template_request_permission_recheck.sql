-- Recheck current module visibility even when the requester withdraws a cached request.
create or replace function private.crm_template_decide(p_id uuid,p_action text,p_note text,p_expected timestamptz) returns public.crm_template_requests language plpgsql security definer set search_path='' as $$
declare r public.crm_template_requests;s jsonb;src jsonb;tbl text;outcome jsonb;resid uuid;v public.contracts;old_context text;
begin
 if auth.uid() is null or not private.crm_active_user() then raise insufficient_privilege;end if;
 select * into r from public.crm_template_requests where id=p_id for update;
 if r.id is null or not(auth.uid()=r.requested_by or auth.uid()=any(r.approver_ids)) then raise insufficient_privilege;end if;
 if not private.crm_can(private.crm_template_module(r.request_type),'view') then raise insufficient_privilege;end if;
 if r.updated_at is distinct from p_expected or r.status<>'pending' then raise exception 'Request changed; reload before deciding';end if;
 if length(coalesce(p_note,''))>2000 or p_action not in ('approve','reject','cancel') then raise exception 'Invalid decision';end if;
 if p_action='cancel' then
  if r.requested_by<>auth.uid() then raise insufficient_privilege;end if;
 else
  if r.requested_by=auth.uid() or r.approver_ids[r.current_step]<>auth.uid() or not private.crm_template_eligible(auth.uid(),r.request_type,true) then raise insufficient_privilege;end if;
  if p_action='reject' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required';end if;
 end if;
 if p_action='approve' then
  if not private.crm_template_eligible(r.requested_by,r.request_type,false) then raise exception 'Requester no longer has permission';end if;
  if r.request_type='lead_merge' then perform pg_advisory_xact_lock(867820);end if;
  tbl:=case when r.request_type in ('lead_merge','lead_reassignment') then 'leads' when r.request_type in ('so_cancellation','special_purchase') then 'crm_sales_orders' when r.request_type='credit_terms' then 'customers' when r.request_type in ('contract_amendment','contract_renewal') then 'contracts' else 'crm_price_items' end;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tbl) into s using r.target_id;
  if s is distinct from r.before_snapshot then raise exception 'Source record changed; withdraw and submit a new request';end if;
  perform private.crm_template_validate(r.request_type,r.target_id,r.payload,s);
  if r.request_type='lead_merge' and nullif(r.payload->>'source_id','') is not null then select to_jsonb(l) into src from public.leads l where id=(r.payload->>'source_id')::uuid for update;if src is distinct from r.source_snapshot then raise exception 'Source lead changed; request again';end if;end if;
  if r.request_type='inventory_adjustment' then
   perform 1 from public.crm_inventory_settings where id for update;
   select jsonb_build_object('quantity',coalesce((select quantity from public.crm_stock_balances where warehouse_id=(r.payload->>'warehouse_id')::uuid and item_id=r.target_id and serial_number=coalesce(r.payload->>'serial_number','') for update),0)) into src;
   if src is distinct from r.source_snapshot then raise exception 'Stock changed; submit a new adjustment request';end if;
  end if;
 end if;
 r.approval_history:=r.approval_history||jsonb_build_array(jsonb_build_object('actor_id',auth.uid(),'action',p_action,'step',r.current_step,'note',p_note,'at',clock_timestamp()));
 update public.notifications set resolved_at=clock_timestamp(),resolution=p_action where event_key='template:'||r.id||':'||r.current_step;
 if p_action='approve' and r.current_step<cardinality(r.approver_ids) then
  r.current_step:=r.current_step+1;
  if not private.crm_template_eligible(r.approver_ids[r.current_step],r.request_type,true) then raise exception 'Next approver no longer eligible';end if;
  perform private.crm_notify_once(r.approver_ids[r.current_step],private.crm_template_module(r.request_type),r.target_id,'approval','template:'||r.id||':'||r.current_step,'ขออนุมัติ / Approval: '||r.approval_policy_name,r.reason,false);
 elsif p_action='approve' then
  update public.crm_template_requests set status='applying' where id=r.id;
  old_context:=current_setting('crm.template_request',true);perform set_config('crm.template_request',r.id::text,true);
  if r.request_type='lead_merge' then
   insert into public.crm_lead_resolutions(request_id,actor_id,target_id,source_id,action,reason,incoming,source_snapshot,reviewer_id,merge_status,merge_owner_id,merge_target_owner_id,resolved_at,reviewed_by,reviewed_at)
   values(r.id,r.requested_by,r.target_id,nullif(r.payload->>'source_id','')::uuid,'merge',r.reason,r.source_snapshot,r.source_snapshot,auth.uid(),'approved',(r.source_snapshot->>'owner_id')::uuid,(s->>'owner_id')::uuid,clock_timestamp(),auth.uid(),clock_timestamp()) returning id into resid;outcome:=jsonb_build_object('resolution_id',resid);
  elsif r.request_type='lead_reassignment' then
   update public.leads set owner_id=(r.payload->>'owner_id')::uuid,owner_name=(select display_name from public.profiles where id=(r.payload->>'owner_id')::uuid),updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(leads) into outcome;
  elsif r.request_type='so_cancellation' then select to_jsonb(public.crm_transition_sales_order(r.target_id,'cancelled',r.reason,(s->>'updated_at')::timestamptz)) into outcome;
  elsif r.request_type='credit_terms' then update public.customers set credit_days=(r.payload->>'credit_days')::integer,credit_limit=(r.payload->>'credit_limit')::numeric,updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(customers) into outcome;
  elsif r.request_type='contract_amendment' then
   select * into v from jsonb_populate_record(null::public.contracts,s||r.payload);
   update public.contracts set name=v.name,product=v.product,value=v.value,start_date=v.start_date,end_date=v.end_date,sla_level=v.sla_level,updated_at=clock_timestamp() where id=r.target_id returning to_jsonb(contracts) into outcome;
  elsif r.request_type='contract_renewal' then select to_jsonb(public.crm_renew_contract(r.target_id,(r.payload->>'end_date')::date,(r.payload->>'value')::numeric)) into outcome;
  elsif r.request_type='inventory_adjustment' then resid:=public.crm_inventory_post(jsonb_build_object('id',r.id,'kind','adjustment','item_id',r.target_id,'warehouse_id',r.payload->>'warehouse_id','serial_number',coalesce(r.payload->>'serial_number',''),'quantity',r.payload->'quantity','reason',r.reason));outcome:=jsonb_build_object('movement_id',resid);
  elsif r.request_type='special_purchase' then
   insert into public.crm_special_purchase_authorizations(request_id,sales_order_id,supplier,items,approved_amount,requested_by,approved_by) values(r.id,r.target_id,r.payload->>'supplier',r.payload->'items',r.amount,r.requested_by,auth.uid()) returning to_jsonb(crm_special_purchase_authorizations) into outcome;
  end if;
  perform set_config('crm.template_request',coalesce(old_context,''),true);r.status:='approved';r.result:=outcome;
 elsif p_action='reject' then r.status:='rejected';else r.status:='cancelled';end if;
 update public.crm_template_requests set status=r.status,current_step=r.current_step,approval_history=r.approval_history,result=r.result,updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(auth.uid(),'update',private.crm_template_module(r.request_type),r.target_id,jsonb_build_object('template_request',r.id,'template',r.request_type,'decision',p_action,'before',r.before_snapshot,'payload',r.payload,'result',r.result));
 if r.status<>'pending' then perform private.crm_notify_once(r.requested_by,private.crm_template_module(r.request_type),r.target_id,'workflow_result','template-result:'||r.id,r.approval_policy_name||' · '||r.status,r.reason,false);end if;
 return r;
end $$;
