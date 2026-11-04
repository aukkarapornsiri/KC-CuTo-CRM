-- Authorize the existing approved scope for its requester or responsible SO owner.
-- Keep independent review, row/version locks, stock reconciliation and reapproval atomic.
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_save_so_amendment(uuid,timestamptz,jsonb)'::regprocedure) into definition;
 if strpos(definition,$old$if a.requested_by<>u then raise insufficient_privilege using message='Only the approved requester can save';end if;$old$)>0 then
  execute replace(definition,$old$if a.requested_by<>u then raise insufficient_privilege using message='Only the approved requester can save';end if;$old$,$new$if not coalesce(u=any(array[a.requested_by,s.owner_id,s.created_by]),false) then raise insufficient_privilege using message='Only the approved requester or SO owner can save';end if;$new$);
 elsif strpos(definition,$new$if not coalesce(u=any(array[a.requested_by,s.owner_id,s.created_by]),false) then raise insufficient_privilege using message='Only the approved requester or SO owner can save';end if;$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_save_so_amendment(uuid,timestamptz,jsonb)';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_amendment_serials(uuid)'::regprocedure) into definition;
 if strpos(definition,$old$join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id where a.id=p_request_id and a.requested_by=auth.uid() and a.status='approved'$old$)>0 then
  execute replace(definition,$old$join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id where a.id=p_request_id and a.requested_by=auth.uid() and a.status='approved'$old$,$new$join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id join public.crm_sales_orders s on s.id=a.sales_order_id where a.id=p_request_id and coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false) and a.reviewed_by is not null and a.reviewed_by<>auth.uid() and a.status='approved' and s.status<>'cancelled'$new$);
 elsif strpos(definition,$new$join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id join public.crm_sales_orders s on s.id=a.sales_order_id where a.id=p_request_id and coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false) and a.reviewed_by is not null and a.reviewed_by<>auth.uid() and a.status='approved' and s.status<>'cancelled'$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_amendment_serials(uuid)';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_stock_on_change()'::regprocedure) into definition;
 if strpos(definition,$old$from public.crm_so_amendments a where a.sales_order_id=new.id and a.status='applying' and a.requested_by=auth.uid() and a.reviewed_by<>auth.uid()$old$)>0 then
  execute replace(definition,$old$from public.crm_so_amendments a where a.sales_order_id=new.id and a.status='applying' and a.requested_by=auth.uid() and a.reviewed_by<>auth.uid()$old$,$new$from public.crm_so_amendments a join public.crm_sales_orders s on s.id=a.sales_order_id where a.sales_order_id=new.id and a.status='applying' and coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false) and a.reviewed_by<>auth.uid()$new$);
 elsif strpos(definition,$new$from public.crm_so_amendments a join public.crm_sales_orders s on s.id=a.sales_order_id where a.sales_order_id=new.id and a.status='applying' and coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false) and a.reviewed_by<>auth.uid()$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_stock_on_change()';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_amendment_notify()'::regprocedure) into definition;
 if strpos(definition,$old$insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(new.requested_by,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
    new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status,'approval_resolved','high') on conflict do nothing;$old$)>0 then
  execute replace(definition,$old$insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(new.requested_by,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
    new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status,'approval_resolved','high') on conflict do nothing;$old$,$new$for dest in select distinct id from (values(new.requested_by),(s.owner_id),(s.created_by)) recipients(id)
    where id is not null and id is distinct from new.reviewed_by
   loop
    insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
    values(dest,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
     new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status||':'||dest,'approval_resolved','high') on conflict do nothing;
   end loop;$new$);
 elsif strpos(definition,$new$for dest in select distinct id from (values(new.requested_by),(s.owner_id),(s.created_by)) recipients(id)
    where id is not null and id is distinct from new.reviewed_by
   loop
    insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
    values(dest,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
     new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status||':'||dest,'approval_resolved','high') on conflict do nothing;
   end loop;$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_amendment_notify()';
 end if;
end $migration$;
