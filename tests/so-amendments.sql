-- Rollback-only end-to-end regression. No business documents or stock persist.
begin;
do $$
declare u uuid;reviewer uuid;c uuid;q uuid;wh uuid;product uuid;s public.crm_sales_orders;a public.crm_so_amendments;
 patch jsonb;balance numeric;approval public.crm_so_approvals;before_count integer;begin
 select id into u from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 select p.id into reviewer from public.profiles p left join public.role_permissions r on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module='quotations' where p.id<>u and p.is_active and p.deleted_at is null and (p.is_super_admin or coalesce(r.can_approve,false)) limit 1;
 if u is null or reviewer is null then raise exception 'Two independent authorized users required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('crm-sales-orders',u||'/amendment-test/po.pdf',u::text,'{"mimetype":"application/pdf","size":100}'),('crm-quotation-assets',u||'/seller-signature-amendment-test.png',u::text,'{"mimetype":"image/png","size":100}'),('crm-quotation-assets',reviewer||'/seller-signature-amendment-test.png',reviewer::text,'{"mimetype":"image/png","size":100}');
 insert into public.crm_sales_signature_defaults(user_id,storage_key) values(u,u||'/seller-signature-amendment-test.png'),(reviewer,reviewer||'/seller-signature-amendment-test.png') on conflict(user_id) do update set storage_key=excluded.storage_key;
 insert into public.crm_warehouses(code,name) values('QA_AMEND_WH','Rollback amendment warehouse') returning id into wh;
 insert into public.crm_price_items(code,name,unit,price,cost,status) values('QA_AMEND_ITEM','Rollback amendment stock','pc',100,50,'active') returning id into product;
 insert into public.crm_item_details(id,stock_mode,track_serial) values(product,'stock',false);
 update public.crm_inventory_settings set auto_issue_on_so=false where id;
 update public.crm_inventory_settings set enabled=true,allow_negative=false,default_warehouse_id=wh where id;
 perform public.crm_inventory_post(jsonb_build_object('id',gen_random_uuid(),'kind','opening','item_id',product,'warehouse_id',wh,'quantity',10,'reason','Rollback amendment test'));
 update public.crm_inventory_settings set auto_issue_on_so=true where id;
 insert into public.customers(name,status) values('QA amendment customer','Active') returning id into c;
 insert into public.quotations(customer_id,owner_id,status,currency,items) values(c,u,'draft','THB',jsonb_build_array(jsonb_build_object('name','Test stock','price_item_id',product,'qty',3,'price',100,'cost',50))) returning id into q;
 s:=public.crm_create_sales_order(q,'QA-AMEND',current_date,u||'/amendment-test/po.pdf','po.pdf');
 perform public.crm_so_approval_action(s.id,'approve','Initial approval');
 a:=public.crm_so_amendment_action(s.id,'request','Change quantity and price',s.updated_at,null);
 if not exists(select 1 from public.notifications where event_key like 'so-amendment:'||a.id||':pending:%') then raise exception 'Missing approver notification';end if;
 if (public.crm_so_amendment_action(s.id,'request','Retry request',s.updated_at,null)).id<>a.id then raise exception 'Duplicate request';end if;
 begin perform public.crm_so_amendment_action(s.id,'approve','Self approval',null,a.id);raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;
 patch:=jsonb_build_object('po_number','QA-REVISED','po_date',current_date,'delivery_details','{}'::jsonb,'note','Revised','billing_address','New billing','tax_rate',7,'wht_rate',0,'document_discount',10,'items',jsonb_build_array((s.items->0)||jsonb_build_object('original_index',0,'qty',4,'price',120)));
 begin perform public.crm_save_so_amendment(a.id,s.updated_at,patch);raise exception 'Unapproved edit accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.crm_so_amendment_action(s.id,'approve','Approved scope',null,a.id);
 begin perform public.crm_save_so_amendment(a.id,s.updated_at,patch);raise exception 'Other user saved';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin perform public.crm_save_so_amendment(a.id,s.updated_at-interval '1 second',patch);raise exception 'Stale edit accepted';exception when others then if sqlerrm not like '%changed;%' then raise;end if;end;
 -- Shortage rolls back SO, fact, cost, permission consumption, and reversed stock.
 begin perform public.crm_save_so_amendment(a.id,s.updated_at,jsonb_set(patch,'{items,0,qty}','100'));raise exception 'Shortage accepted';exception when others then if sqlerrm not like '%Insufficient stock%' then raise;end if;end;
 if (select status from public.crm_so_amendments where id=a.id)<>'approved' or (select quantity from public.crm_stock_balances where item_id=product and warehouse_id=wh)<>7 then raise exception 'Shortage rollback failed';end if;
 s:=public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if s.po_number<>'QA-REVISED' or s.total<>502.90 or s.net_total<>502.90 then raise exception 'Wrong amended totals';end if;
 if (select quantity from public.crm_stock_balances where item_id=product and warehouse_id=wh)<>6 then raise exception 'Reissue balance wrong';end if;
 if not exists(select 1 from public.kc_dw_sales_order_facts where id=s.id and net_amount=470 and gross_profit=270) then raise exception 'Sales fact not updated';end if;
 if not exists(select 1 from public.crm_sales_order_cost_sheets where sales_order_id=s.id and cost_total=200 and gp_amount=270) then raise exception 'Cost snapshot not updated';end if;
 select * into approval from public.crm_so_approvals where sales_order_id=s.id;
 if approval.status<>'pending' or approval.signature_storage_key is not null then raise exception 'Old approval signature not invalidated';end if;
 select count(*) into before_count from public.crm_stock_movements where source_so_id=s.id;
 perform public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if (select count(*) from public.crm_stock_movements where source_so_id=s.id)<>before_count then raise exception 'Retry issued stock twice';end if;
 begin perform public.crm_so_approval_action(s.id,'approve','Self reapproval');raise exception 'Self reapproval accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_approval_action(s.id,'approve','Revised SO approved');
 perform set_config('request.jwt.claim.sub',u::text,true);
 -- Price-only revision does not move stock.
 a:=public.crm_so_amendment_action(s.id,'request','Price adjustment only',s.updated_at,null);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_amendment_action(s.id,'approve','Allowed',null,a.id);
 perform set_config('request.jwt.claim.sub',u::text,true);
 patch:=jsonb_set(patch,'{items,0,price}','125');s:=public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if (select count(*) from public.crm_stock_movements where source_so_id=s.id)<>before_count then raise exception 'Price edit moved stock';end if;
 if not exists(select 1 from public.crm_so_amendments where id=a.id and status='applied' and before_snapshot is not null and after_snapshot is not null and before_approval is not null) then raise exception 'Revision history missing';end if;

 -- Delivered/completed SOs retain their fulfillment history while a revision is reviewed.
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_approval_action(s.id,'approve','Second revision approved');
 perform set_config('request.jwt.claim.sub',u::text,true);
 s:=public.crm_transition_sales_order(s.id,'delivered','TEST-DELIVERY',s.updated_at);
 s:=public.crm_transition_sales_order(s.id,'completed','TEST-COMPLETED',s.updated_at);
 a:=public.crm_so_amendment_action(s.id,'request','Completed SO price correction',s.updated_at,null);
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_amendment_action(s.id,'approve','Allowed',null,a.id);
 perform set_config('request.jwt.claim.sub',u::text,true);
 patch:=jsonb_set(patch,'{items,0,price}','130');s:=public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if s.status<>'completed' or s.delivery_reference<>'TEST-DELIVERY' or s.completed_at is null then raise exception 'Fulfillment history lost';end if;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_approval_action(s.id,'reject','Needs review');
 perform set_config('request.jwt.claim.sub',u::text,true);perform public.crm_so_approval_action(s.id,'request','Resubmit completed revision');
 perform set_config('request.jwt.claim.sub',reviewer::text,true);perform public.crm_so_approval_action(s.id,'approve','Completed revision approved');
 if has_table_privilege('authenticated','public.crm_so_amendments','UPDATE') or has_table_privilege('authenticated','public.crm_sales_orders','UPDATE') or has_function_privilege('anon','public.crm_save_so_amendment(uuid,timestamptz,jsonb)','EXECUTE') then raise exception 'Unsafe direct access';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.crm_so_amendment_action(s.id,'request','Inactive user attempt',s.updated_at,null);raise exception 'Inactive user accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS independent request/approve, no unauthorized save, stale guard, shortage rollback, stock reversal/reissue, financial reconciliation, one-use save, retry dedup, signature invalidation, final reapproval, price-only stock stability and before/after history' result;
