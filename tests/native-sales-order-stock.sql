begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values('crm-sales-orders',auth.uid()::text||'/stock-test/po.pdf',auth.uid()::text,'{"mimetype":"application/pdf","size":100}');
do $$
declare wh uuid;item uuid;c uuid;q uuid;q2 uuid;s public.crm_sales_orders;r public.crm_sales_orders;
begin
 insert into public.crm_warehouses(code,name) values('QA_NATIVE_SO_WH','Rollback native SO warehouse') returning id into wh;
 insert into public.crm_price_items(code,name,unit,price,cost,status) values('QA_NATIVE_SO_PART','Rollback native stock','pc',100,50,'active') returning id into item;
 insert into public.crm_item_details(id,stock_mode,track_serial) values(item,'stock',false);
 update public.crm_inventory_settings set enabled=true,allow_negative=false,default_warehouse_id=wh where id;
 perform public.crm_inventory_post(jsonb_build_object('id',gen_random_uuid(),'kind','opening','item_id',item,'warehouse_id',wh,'quantity',10,'reason','Rollback native SO stock test'));
 update public.crm_inventory_settings set auto_issue_on_so=true where id;
 insert into public.customers(name,status) values('QA native SO stock','Active') returning id into c;
 insert into public.quotations(customer_id,owner_id,status,currency,items)
 values(c,auth.uid(),'draft','THB',jsonb_build_array(jsonb_build_object('name','Stock test','price_item_id',item,'qty',3,'price',100,'cost',50))) returning id into q;
 insert into public.quotations(customer_id,owner_id,status,currency,items)
 values(c,auth.uid(),'draft','THB',jsonb_build_array(jsonb_build_object('name','Insufficient stock test','price_item_id',item,'qty',100,'price',100,'cost',50))) returning id into q2;
 perform set_config('crm.approval_transition','yes',true);
 update public.quotations set status='approved',approval_status='approved' where id in(q,q2);
 perform set_config('crm.approval_transition','',true);
 s:=public.crm_create_sales_order(q,'QA-STOCK',current_date,auth.uid()::text||'/stock-test/po.pdf','po.pdf');
 r:=public.crm_create_sales_order(q,'QA-STOCK',current_date,auth.uid()::text||'/stock-test/po.pdf','po.pdf');
 if s.id<>r.id or (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Native issue/retry incorrect'; end if;
 begin
  perform public.crm_create_sales_order(q2,'QA-TOO-MANY',current_date,auth.uid()::text||'/stock-test/po.pdf','po.pdf');
  raise exception 'Insufficient stock accepted';
 exception when others then if sqlerrm not like 'Insufficient stock for SO %' then raise; end if;end;
 if exists(select 1 from public.crm_sales_orders where quotation_id=q2) or (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Native SO rollback failed'; end if;
 s:=public.crm_transition_sales_order(s.id,'cancelled','Customer cancelled',s.updated_at);
 r:=public.crm_transition_sales_order(s.id,'cancelled','Repeat',s.updated_at);
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>10 or
 (select count(*) from public.crm_stock_movements where source_so_id=s.id)<>2 then raise exception 'Native reversal not exactly once'; end if;
end $$;
rollback;
select 'PASS: native SO issues stock, duplicate conversion does not reissue, shortage rolls back SO and stock, cancellation reverses exactly once; settings and fixtures rolled back' result;
