create or replace function private.crm_netcube_ingest(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 r jsonb; prior jsonb; output jsonb; item public.crm_price_items;
 bid text:=p->>'batch_id'; sid text; pn text; spec text; item_code text;
 observed timestamptz; previous_time timestamptz; item_id uuid;
 n_new int:=0; n_updated int:=0; n_same int:=0; n_notifications int:=0; n int;
 new_cost numeric; seen text[]:='{}'; seen_items uuid[]:='{}';
begin
 if auth.uid() is null or not private.crm_can('inventory','import') or not private.crm_can('inventory','edit') then
  raise exception 'Inventory import and edit permissions required' using errcode='42501';
 end if;
 if bid is null or length(bid) not between 1 and 128 or jsonb_typeof(p->'items') is distinct from 'array'
 or jsonb_array_length(p->'items') not between 1 and 500 or pg_column_size(p)>2097152 then
  raise exception 'Invalid batch: require batch_id and 1..500 items, max 2MB' using errcode='22023';
 end if;
 observed:=(p->>'observed_at')::timestamptz;
 if observed is null or observed>now()+interval '5 minutes' then raise exception 'Invalid observed_at' using errcode='22023';end if;
 perform pg_advisory_xact_lock(913207,1);
 select payload,result into prior,output from private.crm_netcube_runs where batch_id=bid;
 if found then
  if prior<>p then raise exception 'Batch ID already used with different payload' using errcode='22023';end if;
  return output||jsonb_build_object('replayed',true);
 end if;
 for r in select value from jsonb_array_elements(p->'items') loop
  sid:=btrim(r->>'source_id');pn:=btrim(r->>'part_number');spec:=r->>'spec';
  if coalesce(length(sid),0) not between 1 and 128 or coalesce(length(pn),0) not between 1 and 200
   or coalesce(length(btrim(r->>'name')),0) not between 1 and 500 or spec is null or length(spec)>20000
   or jsonb_typeof(r->'cost') is distinct from 'number' then raise exception 'Invalid item fields' using errcode='22023';end if;
  new_cost:=(r->>'cost')::numeric;
  if new_cost<0 or new_cost>1000000000 or new_cost<>round(new_cost,2) or sid=any(seen) then raise exception 'Invalid cost or duplicate source_id' using errcode='22023';end if;
  seen:=array_append(seen,sid);
  item_id:=null;previous_time:=null;
  select m.item_id,m.observed_at into item_id,previous_time from private.crm_netcube_items m where source_id=sid;
  if previous_time is not null and observed<=previous_time then raise exception 'Stale source snapshot' using errcode='22023';end if;
  if item_id is null then
   select count(*), (array_agg(i.id))[1] into n,item_id from public.crm_price_items i
   left join public.crm_item_details d on d.id=i.id
   where upper(btrim(coalesce(nullif(d.part_number,''),nullif(i.product_details->>'part_number',''),i.code)))=upper(pn);
   if n>1 then raise exception 'Ambiguous Part Number' using errcode='22023';end if;
  end if;
  if item_id=any(seen_items) then raise exception 'Duplicate target product' using errcode='22023';end if;
  if item_id is not null and exists(select 1 from private.crm_netcube_items where crm_netcube_items.item_id=item_id and source_id<>sid) then raise exception 'Product already mapped to another source_id' using errcode='22023';end if;
  if item_id is null then
   if not private.crm_can('inventory','create') then raise exception 'Inventory create permission required' using errcode='42501';end if;
   item_code:=upper(regexp_replace(pn,'[^a-zA-Z0-9._-]','-','g'));
   insert into public.crm_price_items(code,name,category,unit,price,cost,description,product_details)
   values(item_code,btrim(r->>'name'),coalesce(r->>'category',''),'Unit',0,new_cost,'Part Number: '||pn||E'\n'||spec,
    jsonb_build_object('part_number',pn,'import_source','netcube','sale_price_pending',true,'stock_mode','nonstock')) returning id into item_id;
   insert into public.crm_item_details(id,part_number,stock_mode,vat_mode) values(item_id,pn,'nonstock','exclusive');
   n_new:=n_new+1;
  else
   select * into item from public.crm_price_items where id=item_id for update;
   if exists(select 1 from public.crm_price_items i where i.id<>item_id and upper(btrim(coalesce(nullif(i.product_details->>'part_number',''),i.code)))=upper(pn)) then raise exception 'Part Number collision' using errcode='22023';end if;
   if item.cost is distinct from new_cost or item.name is distinct from btrim(r->>'name') or item.description is distinct from 'Part Number: '||pn||E'\n'||spec or item.product_details->>'part_number' is distinct from pn then
    update public.crm_price_items set name=btrim(r->>'name'),cost=new_cost,description='Part Number: '||pn||E'\n'||spec,
     product_details=product_details||jsonb_build_object('part_number',pn),updated_at=now() where id=item_id;
    insert into public.crm_item_details(id,part_number) values(item_id,pn) on conflict(id) do update set part_number=excluded.part_number;
    n_updated:=n_updated+1;
    if new_cost>item.cost then
     insert into public.notifications(user_id,type,title,body,related_module,related_id)
     select q.owner_id,'system','ต้นทุนสินค้าเพิ่มขึ้น: '||q.code,
      'สินค้า '||pn||' มีต้นทุนเพิ่มขึ้นจาก Netcube กรุณาตรวจสอบต้นทุนและกำไรของใบเสนอราคา ราคาขายเดิมยังไม่เปลี่ยน','quotations',q.id
     from public.quotations q
     where q.status in ('draft','submitted','pending','approved','sent') and (q.valid_until is null or q.valid_until>=(now() at time zone 'Asia/Bangkok')::date)
     and q.owner_id is not null and private.crm_active_user(q.owner_id) and exists(select 1 from public.profiles recipient left join public.role_permissions rp on rp.role_key=case when recipient.role='custom' then recipient.custom_role_key else recipient.role end and rp.module='quotations' where recipient.id=q.owner_id and (recipient.is_super_admin or coalesce(rp.can_view,false)))
     and exists(select 1 from jsonb_array_elements(q.items) li where li->>'price_item_id'=item_id::text);
     get diagnostics n=row_count;n_notifications:=n_notifications+n;
    end if;
   else n_same:=n_same+1;end if;
  end if;
  seen_items:=array_append(seen_items,item_id);
  insert into private.crm_netcube_items(source_id,item_id,observed_at) values(sid,item_id,observed)
   on conflict(source_id) do update set observed_at=excluded.observed_at;
 end loop;
 output:=jsonb_build_object('batch_id',bid,'created',n_new,'updated',n_updated,'unchanged',n_same,'notifications',n_notifications,'replayed',false);
 insert into private.crm_netcube_runs(batch_id,payload,result,actor_id) values(bid,p,output,auth.uid());
 return output;
end $$;
