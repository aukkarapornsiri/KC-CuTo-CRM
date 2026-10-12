begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_super_admin and private.crm_active_user(id) limit 1),true);
do $test$
declare p jsonb; r jsonb; iid uuid; qid uuid; cnt int; snapshot jsonb;
begin
p:=jsonb_build_object('batch_id','netcube-test-a','observed_at',now()-interval '2 minutes','items',jsonb_build_array(jsonb_build_object('source_id','test-netcube','part_number','TEST-NETCUBE-ROLLBACK','name','Test rollback','cost',100,'spec','RAM 16GB')));
r:=public.crm_netcube_ingest(p);
if (r->>'created')::int<>1 then raise exception 'create failed';end if;
r:=public.crm_netcube_ingest(p);
if not (r->>'replayed')::boolean then raise exception 'replay failed';end if;
select id into iid from public.crm_price_items where code='TEST-NETCUBE-ROLLBACK';
insert into public.quotations(code,owner_id,items,status) values('TEST-NETCUBE-ROLLBACK',auth.uid(),jsonb_build_array(jsonb_build_object('price_item_id',iid,'qty',1,'discount',0,'name','Test','unit','Unit','price',200,'cost',100)),'draft') returning id,items into qid,snapshot;
p:=jsonb_set(jsonb_set(jsonb_set(p,'{batch_id}','"netcube-test-b"'),'{observed_at}',to_jsonb(now()-interval '1 minute')),'{items,0,cost}','110');
r:=public.crm_netcube_ingest(p);
if (r->>'updated')::int<>1 or (r->>'notifications')::int<>1 then raise exception 'update/notification failed %',r;end if;
select count(*) into cnt from public.quotations where id=qid and items=snapshot;
if cnt<>1 then raise exception 'quote snapshot changed';end if;
r:=public.crm_netcube_ingest(p);
select count(*) into cnt from public.notifications where related_id=qid;
if cnt<>1 then raise exception 'duplicate notification';end if;
begin
 perform public.crm_netcube_ingest(jsonb_set(p,'{batch_id}','"netcube-test-stale"'));
 raise exception 'stale accepted';
exception when invalid_parameter_value then null;end;
p:=jsonb_set(jsonb_set(jsonb_set(p,'{batch_id}','"netcube-test-c"'),'{observed_at}',to_jsonb(now())),'{items,0,cost}','90');
r:=public.crm_netcube_ingest(p);
if (r->>'notifications')::int<>0 then raise exception 'decrease notified';end if;
perform set_config('request.jwt.claim.sub','',true);
begin perform public.crm_netcube_ingest(p);raise exception 'anonymous accepted';
exception when insufficient_privilege then null;end;
end $test$;
rollback;
select 'PASS: create, replay, increase notification, snapshot preservation, no duplicate alerts, stale reject, decrease, anonymous deny; rolled back' as result;
