-- Run inside a transaction; all fixtures and settings changes are rolled back.
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
create temp table so_stock_test_result(checks integer);
do $$
declare wh uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); serial_item uuid:=gen_random_uuid(); svc uuid:=gen_random_uuid();
 so uuid:=gen_random_uuid(); old_so uuid:=gen_random_uuid(); no_so uuid:=gen_random_uuid(); serial_so uuid:=gen_random_uuid();
 checks integer:=0; failed boolean; activation timestamptz; payload jsonb; n integer;
begin
 failed:=false;
 begin update public.crm_inventory_settings set auto_issue_on_so=true where id;
 exception when others then failed:=true; end;
 if not failed then raise exception 'Empty inventory setup accepted'; end if; checks:=checks+1;
 insert into public.crm_warehouses(id,code,name) values(wh,'QA_SO_STOCK','Rollback SO stock');
 insert into public.crm_price_items(id,code,name,unit,price,cost,status) values
 (item,'QA_SO_PART','Rollback SO part','pc',100,50,'active'),
 (serial_item,'QA_SO_SERIAL','Rollback SO serial','pc',100,50,'active'),
 (svc,'QA_SO_SERVICE','Rollback service','job',100,50,'active');
 insert into public.crm_item_details(id,stock_mode,track_serial) values(item,'stock',false),(serial_item,'stock',true),(svc,'service',false);
 update public.crm_inventory_settings set enabled=true,allow_negative=false,default_warehouse_id=wh where id;
 perform public.crm_inventory_post(jsonb_build_object('id',gen_random_uuid(),'kind','opening','item_id',item,'warehouse_id',wh,'quantity',10,'reason','Rollback SO stock test'));
 perform public.crm_inventory_post(jsonb_build_object('id',gen_random_uuid(),'kind','opening','item_id',serial_item,'warehouse_id',wh,'quantity',1,'serial_number','QA-SO-SN','reason','Rollback SO serial test'));
 payload:=jsonb_build_array(jsonb_build_object('code','QA_SO_PART','product','Part','quantity',3,'net_amount',100));
 insert into public.kc_dw_sales_order_facts(id,source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
 values(old_so,'QA-SO-LEGACY','QA-SO-LEGACY','qa@example.invalid',now(),date_trunc('month',now())::date,payload);
 update public.crm_inventory_settings set auto_issue_on_so=true where id returning so_stock_enabled_at into activation;
 if activation is null then raise exception 'Activation timestamp missing'; end if; checks:=checks+1;
 update public.kc_dw_sales_order_facts set synced_at=clock_timestamp() where id=old_so;
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>10 then raise exception 'Existing order was backfilled'; end if; checks:=checks+1;
 -- Delayed historical SO arriving after activation is also excluded.
 insert into public.kc_dw_sales_order_facts(source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
 values('QA-SO-OLD-DATE','QA-SO-OLD-DATE','qa@example.invalid',activation-interval '1 day',date_trunc('month',now())::date,payload);
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>10 then raise exception 'Historical order was backfilled'; end if; checks:=checks+1;
 insert into public.kc_dw_sales_order_facts(id,source_so_id,so_number,sales_email,converted_at,period_month,product_lines,source_updated_at)
 values(so,'QA-SO-NEW','QA-SO-NEW','qa@example.invalid',activation+interval '1 second',date_trunc('month',now())::date,payload,activation+interval '2 seconds');
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Opening SO did not issue exactly three'; end if; checks:=checks+1;
 update public.kc_dw_sales_order_facts set synced_at=clock_timestamp() where id=so;
 if (select count(*) from public.crm_stock_movements where source_so_id=so)<>1 then raise exception 'Repeated SO double issued'; end if; checks:=checks+1;
 update public.kc_dw_sales_order_facts set net_amount=200 where id=so;
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Revenue correction changed stock'; end if; checks:=checks+1;
 failed:=false;
 begin update public.kc_dw_sales_order_facts set product_lines=jsonb_set(payload,'{0,quantity}','4') where id=so;
 exception when others then failed:=true; end;
 if not failed then raise exception 'Issued quantity mutation accepted'; end if; checks:=checks+1;
 -- A failing second line must roll back both the first stock change and the SO insert.
 failed:=false;
 begin insert into public.kc_dw_sales_order_facts(id,source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
 values(no_so,'QA-SO-OVER','QA-SO-OVER','qa@example.invalid',activation+interval '1 second',date_trunc('month',now())::date,
 payload||jsonb_build_array(jsonb_build_object('code','QA_SO_PART','quantity',100)));
 exception when others then failed:=true; end;
 if not failed or exists(select 1 from public.kc_dw_sales_order_facts where id=no_so) or
 (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Insufficient stock was not atomic'; end if; checks:=checks+1;
 foreach n in array array[1,2,3] loop
  failed:=false;
  begin insert into public.kc_dw_sales_order_facts(source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
   values('QA-SO-BAD-'||n,'QA-SO-BAD','qa@example.invalid',activation+interval '1 second',date_trunc('month',now())::date,
   case n when 1 then '[{"code":"QA_SO_PART"}]'::jsonb when 2 then '[{"code":"UNKNOWN","quantity":1}]'::jsonb else '[{"code":"QA_SO_SERIAL","quantity":2,"serial_number":"QA-SO-SN"}]'::jsonb end);
  exception when others then failed:=true; end;
  if not failed then raise exception 'Invalid stock input accepted: %',n; end if; checks:=checks+1;
 end loop;
 insert into public.kc_dw_sales_order_facts(source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
 values('QA-SO-SERVICE','QA-SO-SERVICE','qa@example.invalid',activation+interval '1 second',date_trunc('month',now())::date,'[{"code":"QA_SO_SERVICE"}]');
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 then raise exception 'Service affected stock'; end if; checks:=checks+1;
 insert into public.kc_dw_sales_order_facts(id,source_so_id,so_number,sales_email,converted_at,period_month,product_lines)
 values(serial_so,'QA-SO-SERIAL','QA-SO-SERIAL','qa@example.invalid',activation+interval '1 second',date_trunc('month',now())::date,'[{"code":"QA_SO_SERIAL","quantity":1,"serial_number":"QA-SO-SN"}]');
 if (select quantity from public.crm_stock_balances where item_id=serial_item and warehouse_id=wh)<>0 then raise exception 'Serial not issued'; end if; checks:=checks+1;
 update public.kc_dw_sales_order_facts set status='voided' where id=serial_so;
 update public.kc_dw_sales_order_facts set status='voided' where id=serial_so;
 if (select quantity from public.crm_stock_balances where item_id=serial_item and warehouse_id=wh)<>1 or (select count(*) from public.crm_stock_movements where source_so_id=serial_so)<>2 then raise exception 'Serial reversal was not exactly once'; end if; checks:=checks+1;
 update public.crm_inventory_settings set auto_issue_on_so=false,enabled=false where id;
 update public.kc_dw_sales_order_facts set status='cancelled',source_updated_at=activation+interval '3 seconds' where id=so;
 update public.kc_dw_sales_order_facts set status='cancelled' where id=so;
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>10 or (select count(*) from public.crm_stock_movements where source_so_id=so)<>2 then raise exception 'Cancellation after disabling was not exactly once'; end if; checks:=checks+1;
 update public.kc_dw_sales_order_facts set status='converted',source_updated_at=activation where id=so;
 if (select status from public.kc_dw_sales_order_facts where id=so)<>'cancelled' then raise exception 'Stale update reopened SO'; end if; checks:=checks+1;
 failed:=false;
 begin update public.kc_dw_sales_order_facts set status='converted' where id=so;
 exception when others then failed:=true; end;
 if not failed then raise exception 'Reopen accepted while disabled'; end if; checks:=checks+1;
 update public.crm_inventory_settings set enabled=true,auto_issue_on_so=true where id;
 update public.kc_dw_sales_order_facts set status='converted' where id=so;
 if (select quantity from public.crm_stock_balances where item_id=item and warehouse_id=wh)<>7 or (select cycle from public.crm_so_stock_orders where so_id=so)<>2 then raise exception 'Reopen cycle incorrect'; end if; checks:=checks+1;
 if exists(select 1 from public.crm_stock_movements where source_so_id is not null and created_by is not null) then raise exception 'Automation impersonates human'; end if; checks:=checks+1;
 if has_function_privilege('authenticated','private.crm_so_stock_on_change()','execute') or has_function_privilege('service_role','private.crm_so_stock_on_change()','execute') then raise exception 'Internal trigger is directly executable'; end if; checks:=checks+1;
 insert into so_stock_test_result values(checks);
end $$;
set local role authenticated;
do $$ declare failed boolean; begin
 failed:=false;begin delete from public.crm_so_stock_orders;exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'User can erase SO issue guard';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.crm_so_stock_orders) then raise exception 'Unknown user can read SO stock';end if;
end $$;
reset role;
select 'PASS: SO issue/reversal, idempotency, atomicity, stale updates, excluded history, serials, service items, access control' result,checks+2 checks from so_stock_test_result;
rollback;
