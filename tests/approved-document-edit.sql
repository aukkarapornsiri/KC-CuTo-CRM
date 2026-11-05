-- Every fixture, setting, audit and notification is rolled back.
begin;
do $$
declare u uuid;reviewer uuid;q public.quotations;s public.crm_sales_orders;a public.crm_so_amendments;settings jsonb;request jsonb;patch jsonb;before_movements bigint;begin
 select id into u from public.profiles where is_super_admin and is_active and deleted_at is null limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select id into reviewer from public.profiles where id<>u and private.crm_flow_eligible(id) order by id limit 1;
 if u is null or reviewer is null then raise exception 'Two eligible users required';end if;
 update public.crm_approval_policies set is_active=false where request_type='quotation_edit' and deleted_at is null and is_active;
 insert into public.crm_approval_policies(name,request_type,minimum_amount,approver_ids,is_active) values('QA rollback quotation editing','quotation_edit',0,array[reviewer],true);
 insert into public.quotations(owner_id,status,items,tax_rate,wht_rate,document_discount) values(u,'draft','[{"name":"QA rollback edit","qty":1,"price":100,"cost":50}]',7,0,0) returning * into q;
 perform set_config('crm.approval_transition','yes',true);update public.quotations set status='approved',approval_status='approved' where id=q.id returning * into q;perform set_config('crm.approval_transition','',true);
 begin update public.quotations set note='Unauthorized revision' where id=q.id;raise exception 'Unapproved edit accepted';exception when insufficient_privilege then null;end;
 request:=public.crm_quotation_edit_action(q.id,'request','QA one-time edit',null,q.updated_at);
 begin perform public.crm_quotation_edit_action(q.id,'approve','Self review',(request->>'id')::uuid);raise exception 'Self review accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);request:=public.crm_quotation_edit_action(q.id,'approve','Allowed',(request->>'id')::uuid);
 if request->>'status'<>'approved' then raise exception 'Authorization failed';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);update public.quotations set note='Authorized revision',updated_at=clock_timestamp() where id=q.id returning * into q;
 if q.approval_status is not null or q.status<>'draft' or (select status from public.crm_quotation_edit_requests where id=(request->>'id')::uuid)<>'applied' then raise exception 'One-time edit not consumed';end if;
 settings:=public.crm_document_edit_policy();settings:=public.crm_document_edit_policy(jsonb_build_object('quotation_requires_approval',false,'so_requires_approval',false,'expected_updated_at',settings->>'updated_at'));
 perform set_config('crm.approval_transition','yes',true);update public.quotations set approval_status='approved',status='approved' where id=q.id;perform set_config('crm.approval_transition','',true);
 update public.quotations set note='Direct revision',updated_at=clock_timestamp() where id=q.id returning * into q;if q.status<>'draft' then raise exception 'Direct quotation edit failed';end if;
 perform set_config('crm.approval_transition','yes',true);update public.quotations set approval_status='pending',status='draft' where id=q.id;perform set_config('crm.approval_transition','',true);
 begin update public.quotations set note='Must stay locked' where id=q.id;raise exception 'Pending edit accepted';exception when others then if sqlerrm not like 'Withdraw pending approval%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 if not exists(select 1 from public.profiles where id=reviewer and is_super_admin) then
 begin perform public.crm_document_edit_policy(jsonb_build_object('quotation_requires_approval',true,'so_requires_approval',true,'expected_updated_at',settings->>'updated_at'));raise exception 'Non-admin changed settings';exception when insufficient_privilege then null;end;end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select o.* into s from public.crm_sales_orders o join public.crm_so_approvals ap on ap.sales_order_id=o.id and ap.status='approved' join public.profiles p on p.id=coalesce(o.owner_id,o.created_by) and p.is_active and p.deleted_at is null where o.status<>'cancelled' and not exists(select 1 from public.crm_so_amendments x where x.sales_order_id=o.id and x.status in ('pending','approved','applying')) order by o.created_at desc limit 1;
 if s.id is null then raise exception 'Approved SO fixture required';end if;
 perform set_config('request.jwt.claim.sub',coalesce(s.owner_id,s.created_by)::text,true);
 a:=public.crm_so_amendment_action(s.id,'request','QA direct edit',s.updated_at,null);
 if a.status<>'approved' or not a.approval_bypassed or a.reviewed_by is not null then raise exception 'Direct SO edit needs approval';end if;
 perform public.crm_so_amendment_serials(a.id);
 patch:=jsonb_build_object('po_number',s.po_number,'po_date',s.po_date,'expected_delivery_date',s.expected_delivery_date,'billing_address',s.billing_address,'delivery_details',coalesce(s.delivery_details,'{}'),'note',coalesce(s.note,'')||' QA rollback','tax_rate',case when s.subtotal-s.discount=0 then 7 else round(s.vat/(s.subtotal-s.discount)*100,2) end,'wht_rate',case when s.subtotal-s.discount=0 then 0 else round(s.withholding_tax/(s.subtotal-s.discount)*100,2) end,'document_discount',s.discount-(select coalesce(sum((x->>'discount')::numeric),0) from jsonb_array_elements(s.items)x),'items',(select jsonb_agg(x||jsonb_build_object('original_index',ord-1)) from jsonb_array_elements(s.items) with ordinality v(x,ord)));
 select count(*) into before_movements from public.crm_stock_movements where source_so_id=s.id;
 s:=public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if (select status from public.crm_so_amendments where id=a.id)<>'applied' or (select status from public.crm_so_approvals where sales_order_id=s.id)<>'pending' then raise exception 'Direct SO save failed';end if;
 if (select count(*) from public.crm_stock_movements where source_so_id=s.id)<>before_movements then raise exception 'Note edit moved stock';end if;
 perform set_config('request.jwt.claim.sub','',true);begin perform public.crm_document_edit_policy();raise exception 'Anonymous settings access';exception when insufficient_privilege then null;end;
end $$;
rollback;
