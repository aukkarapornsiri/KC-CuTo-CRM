CREATE OR REPLACE FUNCTION private.crm_so_approval_action(p_sales_order_id uuid, p_action text, p_note text DEFAULT ''::text)
 RETURNS crm_so_approvals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.crm_sales_orders; a public.crm_so_approvals; u uuid:=auth.uid();
begin
 if u is null or not private.crm_active_user() then raise exception 'Login required' using errcode='42501'; end if;
 if p_action not in ('request','approve','reject') then raise exception 'Invalid approval action'; end if;
 select * into o from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found'; end if;
 if o.status='cancelled' or (o.status in ('completed','delivered') and not exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied' and (m.after_snapshot->>'updated_at')::timestamptz=o.updated_at)) then raise exception 'Sales order is not eligible for approval'; end if;
 if p_action='request' then
  if not (private.crm_can('quotations','create') and (o.owner_id=u or o.created_by=u)) and not private.crm_can('quotations','approve') then
   raise exception 'Not allowed to request approval' using errcode='42501';
  end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if found and a.status='approved' then raise exception 'Sales order already approved'; end if;
  if found and a.status='pending' then return a; end if;
  insert into public.crm_so_approvals(sales_order_id,requested_by,revision,status,requested_at,review_note,reviewed_by,reviewed_at,updated_at)
  values(p_sales_order_id,u,coalesce(a.revision,0)+1,'pending',now(),' ',null,null,now())
  on conflict(sales_order_id) do update set
    status='pending',requested_by=excluded.requested_by,requested_at=now(),
    reviewed_by=null,reviewed_at=null,review_note='',revision=public.crm_so_approvals.revision+1,updated_at=now()
  returning * into a;
 else
  if not private.crm_can('quotations','approve') then raise exception 'SO approve permission required' using errcode='42501'; end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if a.requested_by=u and exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied') then raise insufficient_privilege using message='Independent SO approver required';end if;
  if not found or a.status<>'pending' then raise exception 'SO has no pending approval'; end if;
  if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required'; end if;
  update public.crm_so_approvals set status=case when p_action='approve' then 'approved' else 'rejected' end,
  reviewed_by=u,reviewed_at=now(),review_note=left(coalesce(p_note,''),2000),updated_at=now()
  where sales_order_id=p_sales_order_id returning * into a;
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id)
 values(p_sales_order_id,'so_approval_'||p_action,coalesce(p_note,''),u);
 insert into public.audit_logs(user_id,action,module,record_id,changes)
 values(u,'update','quotations',o.quotation_id,
 jsonb_build_object('sales_order_id',o.id,'approval_action',p_action,'status',a.status,'revision',a.revision,'note',left(coalesce(p_note,''),2000)));
 return a;
end $function$;

