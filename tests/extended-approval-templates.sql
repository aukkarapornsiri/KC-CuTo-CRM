-- End-to-end business mutations, notices, fixtures and permission changes all roll back.
do $$
declare u uuid;v uuid;w uuid;k text;cid uuid;lid uuid;conid uuid;pid uuid;wh uuid;soid uuid;uid uuid;r public.crm_template_requests;payload jsonb;stamp timestamptz;name text;before_count bigint;s public.crm_sales_orders;native public.crm_lead_duplicate_policies;central public.crm_approval_policies;result jsonb;
begin
 select id into u from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 select id into v from public.profiles where id<>u and is_active and deleted_at is null order by id limit 1;
 select id into w from public.profiles where id not in (u,v) and is_active and deleted_at is null order by id limit 1;
 if u is null or v is null or w is null then raise exception 'Three active fixture accounts required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.custom_roles(role_key,label_th,label_en) values('qa_template_reviewer','QA reviewer','QA reviewer');
 insert into public.role_permissions(role_key,module,can_view,can_create,can_edit,can_approve,can_assign) select 'qa_template_reviewer',m,true,true,true,true,true from unnest(array['leads','quotations','customers','contracts','inventory']) m;
 update public.profiles set role='custom',custom_role_key='qa_template_reviewer' where id in(v,w);
 update public.crm_approval_policies set is_active=false where request_type in ('lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase');
 foreach k in array array['lead_merge','lead_reassignment','so_cancellation','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase'] loop
  insert into public.crm_approval_policies(name,request_type,minimum_amount,approver_ids,is_active) values('QA template '||k,k,0,array[v,w],true);
 end loop;
 insert into public.customers(name,owner_id) values('QA approval template rollback',u) returning id into cid;
 insert into public.leads(company_name,owner_id,first_name,last_name,email,tax_id,mobile,mailing_city,mailing_state,mailing_postal_code,lead_assigner_id,product_interest) values('QA merge template '||gen_random_uuid(),null,'QA','Rollback','qa-template@example.invalid',lpad((floor(random()*1e12))::bigint::text,13,'9'),'0999999999','Bangkok','Bangkok','10240',u,'QA test') returning id,company_name into lid,name;
 insert into public.contracts(name,customer_id,owner_id,start_date,end_date,value,status) values('QA template contract',cid,u,current_date,current_date+30,100,'active') returning id into conid;
 insert into public.crm_price_items(code,name,price,cost,unit,status) values('QA-'||upper(substr(gen_random_uuid()::text,1,8)),'QA stock approval',100,50,'Unit','active') returning id into pid;
 insert into public.crm_item_details(id,stock_mode,track_serial) values(pid,'stock',false);
 insert into public.crm_warehouses(code,name,active) values('QA-'||upper(substr(gen_random_uuid()::text,1,8)),'QA warehouse approval',true) returning id into wh;
 update public.crm_inventory_settings set enabled=true where id;
 -- Existing SO is read and modified only within this transaction, then rolled back.
 select id into soid from public.crm_sales_orders where status='confirmed' order by created_at desc limit 1;
 if soid is null then raise exception 'Confirmed SO fixture required';end if;
 -- Ensure the test reviewers are independent of that SO's owner.
 update public.crm_sales_orders set owner_id=u where id=soid;
 execute 'set local role authenticated';
 foreach k in array array['lead_merge','lead_reassignment','credit_terms','contract_amendment','contract_renewal','inventory_adjustment','special_purchase','so_cancellation'] loop
  perform set_config('request.jwt.claim.sub',u::text,true);
  if k='lead_merge' then uid:=lid;payload:=jsonb_build_object('incoming',jsonb_build_object('company_name',name,'owner_id',u,'contact_name','QA incoming contact'));select updated_at into stamp from public.leads where id=lid;
  elsif k='lead_reassignment' then uid:=lid;payload:=jsonb_build_object('owner_id',w);select updated_at into stamp from public.leads where id=lid;
  elsif k='credit_terms' then uid:=cid;payload:='{"credit_days":45,"credit_limit":250000}';select updated_at into stamp from public.customers where id=cid;
  elsif k='contract_amendment' then uid:=conid;payload:='{"value":150,"product":"Expanded service"}';select updated_at into stamp from public.contracts where id=conid;
  elsif k='contract_renewal' then uid:=conid;payload:=jsonb_build_object('value',200,'end_date',current_date+400);select updated_at into stamp from public.contracts where id=conid;
  elsif k='inventory_adjustment' then uid:=pid;payload:=jsonb_build_object('warehouse_id',wh,'serial_number','','quantity',5);select updated_at into stamp from public.crm_price_items where id=pid;
  else uid:=soid;payload:=case when k='special_purchase' then '{"supplier":"QA supplier","items":[{"name":"QA item","qty":2,"unit_cost":80}]}'::jsonb else '{}'::jsonb end;select updated_at into stamp from public.crm_sales_orders where id=soid;
  end if;
  -- For reassignment, target owner must not be in the reviewers at submission.
  if k='lead_reassignment' then payload:=jsonb_build_object('owner_id',v);end if;
  r:=public.crm_template_submit(k,uid,payload,'QA rollback approval',stamp);
  begin perform public.crm_template_decide(r.id,'approve','Self review',r.updated_at);raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',w::text,true);
  begin perform public.crm_template_decide(r.id,'approve','Out of order',r.updated_at);raise exception 'Out-of-order approval accepted';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',v::text,true);r:=public.crm_template_decide(r.id,'approve','Step one',r.updated_at);
  if r.status<>'pending' or r.current_step<>2 or r.result is not null then raise exception 'Action ran before final approval: %',k;end if;
  perform set_config('request.jwt.claim.sub',w::text,true);r:=public.crm_template_decide(r.id,'approve','Step two',r.updated_at);
  if r.status<>'approved' or r.result is null then raise exception 'Action not applied: %',k;end if;
  if k='credit_terms' and not exists(select 1 from public.customers where id=cid and credit_days=45 and credit_limit=250000) then raise exception 'Credit not updated';end if;
  if k='lead_reassignment' and not exists(select 1 from public.leads where id=lid and owner_id=v) then raise exception 'Owner not transferred';end if;
  if k='lead_merge' and not exists(select 1 from public.crm_lead_resolutions where request_id=r.id and action='merge' and incoming->>'contact_name'='QA incoming contact') then raise exception 'Incoming merge lost';end if;
  if k='contract_amendment' and not exists(select 1 from public.contracts where id=conid and value=150 and product='Expanded service') then raise exception 'Contract amendment missing';end if;
  if k='contract_renewal' and not exists(select 1 from public.contracts where renewed_from_id=conid and value=200) then raise exception 'Renewed contract missing';end if;
  if k='inventory_adjustment' and not exists(select 1 from public.crm_stock_balances where item_id=pid and warehouse_id=wh and quantity=5) then raise exception 'Stock adjustment missing';end if;
  if k='special_purchase' and not exists(select 1 from public.crm_special_purchase_authorizations where request_id=r.id and approved_amount=160) then raise exception 'Purchase authorization missing';end if;
  if k='so_cancellation' and not exists(select 1 from public.crm_sales_orders where id=soid and status='cancelled') then raise exception 'SO not cancelled';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select * into central from public.crm_approval_policies where request_type='lead_merge';
 select * into native from public.crm_lead_duplicate_policies where id=central.lead_policy_id;
 if native.id is null or native.approver_ids<>central.approver_ids or native.name<>central.name then raise exception 'Lead route was not linked';end if;
 result:=public.crm_lead_policy_change('toggle',native.id,native.version,'{}');
 if (select is_active from public.crm_approval_policies where id=central.id) then raise exception 'Native toggle did not update workflow policy';end if;
 result:=public.crm_lead_policy_change('toggle',native.id,(result->>'version')::integer,'{}');
 update public.crm_approval_policies set name='QA synced route' where id=central.id returning * into central;
 if not exists(select 1 from public.crm_lead_duplicate_policies n where n.id=native.id and n.name=central.name and n.approver_ids=central.approver_ids) then raise exception 'Workflow edit did not update native route';end if;
 perform public.crm_archive_approval_flow(central.id,central.updated_at);
 if exists(select 1 from public.crm_approval_policies where id=central.id) or exists(select 1 from public.crm_lead_duplicate_policies where id=native.id) then raise exception 'Linked deletion did not remove both policies';end if;
 if not exists(select 1 from public.crm_template_requests where request_type='lead_merge' and status='approved' and jsonb_array_length(approval_history)=2) then raise exception 'Policy deletion lost request history';end if;
 -- Active policy blocks direct changes and a forged execution GUC.
 perform set_config('crm.template_request',r.id::text,true);
 begin update public.customers set credit_days=90 where id=cid;raise exception 'Direct credit bypass accepted';exception when insufficient_privilege then null;end;
 -- Disabled policy permits the ordinary authorized write path.
 update public.crm_approval_policies set is_active=false where request_type='credit_terms';
 update public.customers set credit_days=30 where id=cid;
 update public.crm_approval_policies set is_active=true where request_type='credit_terms';
 select updated_at into stamp from public.customers where id=cid;
 r:=public.crm_template_submit('credit_terms',cid,'{"credit_days":60,"credit_limit":300000}','QA stale request',stamp);
 update public.customers set description='QA changed after request',updated_at=clock_timestamp() where id=cid;
 perform set_config('request.jwt.claim.sub',v::text,true);
 begin perform public.crm_template_decide(r.id,'approve','Stale',r.updated_at);raise exception 'Stale request accepted';exception when others then if sqlerrm not like 'Source record changed%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',u::text,true);r:=public.crm_template_decide(r.id,'cancel','Withdraw stale request',r.updated_at);
 select updated_at into stamp from public.customers where id=cid;
 r:=public.crm_template_submit('credit_terms',cid,'{"credit_days":60,"credit_limit":300000}','QA rejected request',stamp);
 perform set_config('request.jwt.claim.sub',v::text,true);r:=public.crm_template_decide(r.id,'reject','Not authorized for this amount',r.updated_at);
 if r.status<>'rejected' or (select credit_days from public.customers where id=cid)<>30 then raise exception 'Rejected request applied';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin update public.crm_template_requests set status='approved' where id=r.id;raise exception 'Direct request write accepted';exception when insufficient_privilege then null;end;
 update public.role_permissions set can_view=false where role_key='qa_template_reviewer' and module='customers';
 perform set_config('request.jwt.claim.sub',v::text,true);
 if exists(select 1 from public.crm_template_requests where id=r.id) then raise exception 'Revoked module permission still exposes request';end if;
 begin perform public.crm_template_submit('credit_terms',cid,'{"credit_days":1,"credit_limit":1}','Revoked permission',stamp);raise exception 'Revoked user submitted a request';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 update public.role_permissions set can_view=true where role_key='qa_template_reviewer' and module='customers';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.crm_template_submit('credit_terms',cid,'{}','Anonymous request',stamp);raise exception 'Anonymous request accepted';exception when insufficient_privilege then null;end;
end $$;
