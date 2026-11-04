-- SO amendments are initiated and applied by the responsible salesperson.
-- Approval permission does not grant permission to edit another salesperson's SO.
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_amendment_action(uuid,text,text,timestamptz,uuid)'::regprocedure) into definition;
 if strpos(definition,$old$if not private.crm_can('quotations','edit') or (s.owner_id<>u and s.created_by<>u and not private.crm_can('quotations','approve')) then raise insufficient_privilege using message='Only the responsible user can request an SO amendment';end if;$old$)>0 then
  execute replace(definition,$old$if not private.crm_can('quotations','edit') or (s.owner_id<>u and s.created_by<>u and not private.crm_can('quotations','approve')) then raise insufficient_privilege using message='Only the responsible user can request an SO amendment';end if;$old$,$new$if not private.crm_can('quotations','edit') or u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can request an SO amendment';end if;$new$);
 elsif strpos(definition,$new$if not private.crm_can('quotations','edit') or u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can request an SO amendment';end if;$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_amendment_action(uuid,text,text,timestamptz,uuid)';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_save_so_amendment(uuid,timestamptz,jsonb)'::regprocedure) into definition;
 if strpos(definition,$old$if not coalesce(u=any(array[a.requested_by,s.owner_id,s.created_by]),false) then raise insufficient_privilege using message='Only the approved requester or SO owner can save';end if;$old$)>0 then
  execute replace(definition,$old$if not coalesce(u=any(array[a.requested_by,s.owner_id,s.created_by]),false) then raise insufficient_privilege using message='Only the approved requester or SO owner can save';end if;$old$,$new$if u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can save this SO revision';end if;$new$);
 elsif strpos(definition,$new$if u is distinct from coalesce(s.owner_id,s.created_by) then raise insufficient_privilege using message='Only the responsible salesperson can save this SO revision';end if;$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_save_so_amendment(uuid,timestamptz,jsonb)';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_amendment_serials(uuid)'::regprocedure) into definition;
 if strpos(definition,$old$coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false)$old$)>0 then
  execute replace(definition,$old$coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false)$old$,$new$auth.uid()=coalesce(s.owner_id,s.created_by)$new$);
 elsif strpos(definition,$new$auth.uid()=coalesce(s.owner_id,s.created_by)$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_amendment_serials(uuid)';
 end if;
end $migration$;
do $migration$
declare definition text;begin
 select pg_get_functiondef('private.crm_so_stock_on_change()'::regprocedure) into definition;
 if strpos(definition,$old$coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false)$old$)>0 then
  execute replace(definition,$old$coalesce(auth.uid()=any(array[a.requested_by,s.owner_id,s.created_by]),false)$old$,$new$auth.uid()=coalesce(s.owner_id,s.created_by)$new$);
 elsif strpos(definition,$new$auth.uid()=coalesce(s.owner_id,s.created_by)$new$)=0 then
  raise exception 'Unexpected function definition: private.crm_so_stock_on_change()';
 end if;
end $migration$;
