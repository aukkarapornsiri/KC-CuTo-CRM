-- Rollback-only authenticated tests; no customer orders or actual files remain.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and is_active and deleted_at is null limit 1),true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values('crm-sales-orders',auth.uid()::text||'/regression/po.pdf',auth.uid()::text,'{"mimetype":"application/pdf","size":100}');
set local role authenticated;
do $$
declare c uuid;q uuid;q2 uuid;qdraft uuid;s public.crm_sales_orders;r public.crm_sales_orders;before_facts bigint;key text:=auth.uid()::text||'/regression/po.pdf';
begin
 if auth.uid() is null then raise exception 'Active admin required'; end if;
 insert into public.customers(name,status,address) values('QA Native SO','Active','1 Test Street') returning id into c;
 insert into public.quotations(customer_id,owner_id,status,currency,items,document_discount)
 values(c,auth.uid(),'draft','THB','[{"name":"QA A","qty":2,"price":100,"discount":0,"cost":50},{"name":"QA B","qty":1,"price":50,"cost":20}]',10) returning id into q;
 qdraft:=q;
 begin
  perform public.crm_create_sales_order(q,'QA-PO',current_date,key,'po.pdf');
  raise exception 'Draft converted unexpectedly';
 exception when others then if sqlerrm not like '%must be approved%' then raise; end if; end;
 perform set_config('crm.approval_transition','yes',true);
 update public.quotations set approval_status='approved',status='approved' where id=q;
 perform set_config('crm.approval_transition','',true);
 begin
  perform public.crm_create_sales_order(q,'QA-PO',current_date,'invalid/file','po.pdf');
  raise exception 'Invalid attachment accepted';
 exception when others then if sqlerrm not like '%Upload the customer PO%' then raise; end if; end;
 select count(*) into before_facts from public.kc_dw_sales_order_facts;
 s:=public.crm_create_sales_order_with_details(q,'QA-PO',current_date,key,'po.pdf',current_date+7,'QA','{}','{"order_type":"Runrate","shipping_address":"Warehouse 2","recipient_name":"Recipient QA","recipient_phone":"0810000000","installation":"no"}');
 if s.delivery_details->>'shipping_address'<>'Warehouse 2' or s.delivery_details->>'installation'<>'no' then raise exception 'Delivery snapshot missing';end if;
 r:=public.crm_create_sales_order(q,'DIFFERENT-RETRY',current_date,key,'po.pdf');
 if s.id<>r.id or s.po_number<>r.po_number then raise exception 'Retry was not idempotent'; end if;
 if (select count(*) from public.kc_dw_sales_order_facts)<>before_facts+1 then raise exception 'Duplicate fact'; end if;
 if not exists(select 1 from public.kc_dw_sales_order_facts where id=s.id and source_system='KC CuTo CRM' and net_amount=240 and currency='THB' and status='converted') then raise exception 'Wrong sales fact'; end if;
 if (select sum((x->>'net_amount')::numeric) from public.kc_dw_sales_order_facts f,jsonb_array_elements(f.product_lines)x where f.id=s.id)<>240 then raise exception 'Discount allocation mismatch'; end if;
 if s.billing_address<>'1 Test Street' then raise exception 'Quote address snapshot missing'; end if;
 begin
  update public.crm_sales_orders set total=1 where id=s.id;
  raise exception 'Direct money tampering allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.crm_transition_sales_order(s.id,'completed','',s.updated_at);
  raise exception 'Skipped delivery';
 exception when others then if sqlerrm not like '%Invalid sales order transition%' then raise; end if; end;
 begin
  perform public.crm_transition_sales_order(s.id,'delivered','DEL-001',s.updated_at-interval '1 second');
  raise exception 'Stale transition accepted';
 exception when others then if sqlerrm not like '%changed; reload%' then raise; end if; end;
 r:=public.crm_transition_sales_order(s.id,'delivered','DEL-001',s.updated_at);
 s:=public.crm_transition_sales_order(s.id,'completed','Done',r.updated_at);
 if s.status<>'completed' or s.delivery_reference<>'DEL-001' then raise exception 'Delivery lifecycle failed'; end if;
 begin
  perform public.crm_transition_sales_order(s.id,'cancelled','Wrong',s.updated_at);
  raise exception 'Completed order cancelled';
 exception when others then if sqlerrm not like '%Invalid sales order transition%' then raise; end if; end;
 insert into public.quotations(customer_id,owner_id,status,currency,items)
 values(c,auth.uid(),'draft','THB','[{"name":"QA cancel","qty":1,"price":20,"cost":10}]') returning id into q2;
 perform set_config('crm.approval_transition','yes',true);
 update public.quotations set approval_status='approved',status='approved' where id=q2;
 perform set_config('crm.approval_transition','',true);
 s:=public.crm_create_sales_order(q2,'QA-CANCEL',current_date,key,'po.pdf');
 s:=public.crm_transition_sales_order(s.id,'cancelled','Customer cancelled',s.updated_at);
 r:=public.crm_transition_sales_order(s.id,'cancelled','Repeat',s.updated_at);
 if s.id<>r.id or (select status from public.kc_dw_sales_order_facts where id=s.id)<>'cancelled' then raise exception 'Cancel/retry failed'; end if;
 if (select count(*) from public.crm_sales_order_events where sales_order_id=s.id and action='cancelled')<>1 then raise exception 'Duplicate cancellation event'; end if;
 if (select count(*) from public.crm_sales_order_events where sales_order_id=s.id)<>2 then raise exception 'Missing audit history'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.crm_sales_orders;raise exception 'Anonymous access allowed';exception when insufficient_privilege then null;end;
 begin perform public.crm_create_sales_order(gen_random_uuid(),'PO',current_date,'x','x');raise exception 'Anonymous conversion allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
 begin perform public.crm_create_sales_order(gen_random_uuid(),'PO',current_date,'x','x');raise exception 'Unregistered user conversion allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: approval gate, attachment, conversion, idempotency, amounts, snapshots, direct-write denial, delivery, completion, cancellation, concurrency token and anonymous isolation; all fixtures rolled back' result;
