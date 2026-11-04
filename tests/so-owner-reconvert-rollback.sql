-- Rollback-only verification against an independently approved, unchanged scope.
-- Every SO, stock, cost, notification and audit write is rolled back.
begin;
set local statement_timeout='15s';
do $test$
declare a public.crm_so_amendments;s public.crm_sales_orders;revised public.crm_sales_orders;
 patch jsonb;net numeric;old_code text;old_id uuid;old_quote jsonb;old_count bigint;serials jsonb;begin
 select a0.* into a from public.crm_so_amendments a0 join public.crm_sales_orders s0 on s0.id=a0.sales_order_id
 where a0.status='approved' and a0.requested_by<>s0.owner_id and a0.reviewed_by<>s0.owner_id
 and a0.base_updated_at=s0.updated_at and s0.status<>'cancelled' limit 1;
 if not found then raise exception 'No unchanged manager-requested approved scope available';end if;
 select * into s from public.crm_sales_orders where id=a.sales_order_id;
 old_code:=s.code;old_id:=s.id;select to_jsonb(q) into old_quote from public.quotations q where id=s.quotation_id;
 select count(*) into old_count from public.crm_sales_orders;
 net:=s.subtotal-s.discount;
 select jsonb_build_object('po_number',s.po_number,'po_date',s.po_date,'po_file_key',s.po_file_key,'po_file_name',s.po_file_name,
  'expected_delivery_date',s.expected_delivery_date,'billing_address',s.billing_address,'delivery_details',s.delivery_details,'note',s.note,
  'tax_rate',case when net=0 then 7 else round(s.vat/net*100,2) end,
  'wht_rate',case when net=0 then 0 else round(s.withholding_tax/net*100,2) end,
  'document_discount',s.discount-(select coalesce(sum((x->>'discount')::numeric),0) from jsonb_array_elements(s.items) x),
  'items',(select jsonb_agg(x.value||jsonb_build_object('original_index',x.ordinality-1,
    'serial_number',coalesce(fact.product_lines->(x.ordinality::int-1)->>'serial_number',''),
    'cost',(cost.line_financials->(x.ordinality::int-1)->>'cost_total')::numeric/
      case when x.value->>'billing_period'='once' then 1 else (x.value->>'qty')::numeric*coalesce((x.value->>'cycle_count')::numeric,1) end) order by x.ordinality)
    from jsonb_array_elements(s.items) with ordinality x)) into patch
 from public.crm_sales_order_cost_sheets cost join public.kc_dw_sales_order_facts fact on fact.id=cost.sales_order_id where cost.sales_order_id=s.id;
 perform set_config('request.jwt.claim.sub',a.reviewed_by::text,true);
 begin perform public.crm_save_so_amendment(a.id,s.updated_at,patch);raise exception 'Reviewer edited their approved scope';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a.requested_by::text,true);
 begin perform public.crm_so_amendment_action(s.id,'request','Manager must not initiate editing',s.updated_at,null);raise exception 'Manager requested another salesperson SO';exception when insufficient_privilege then null;end;
 begin perform public.crm_save_so_amendment(a.id,s.updated_at,patch);raise exception 'Manager edited another salesperson SO';exception when insufficient_privilege then null;end;
 begin perform public.crm_so_amendment_serials(a.id);raise exception 'Manager accessed amendment editor serials';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',s.owner_id::text,true);
 serials:=public.crm_so_amendment_serials(a.id);
 if serials is null then raise exception 'Owner cannot load authorized serials';end if;
 begin perform public.crm_save_so_amendment(a.id,s.updated_at-interval '1 second',patch);raise exception 'Stale revision accepted';exception when others then if sqlerrm not like '%changed;%' then raise;end if;end;
 revised:=public.crm_save_so_amendment(a.id,s.updated_at,patch);
 if revised.code<>old_code or revised.id<>old_id or revised.quotation_id<>s.quotation_id then raise exception 'SO identity changed';end if;
 if (select count(*) from public.crm_sales_orders)<>old_count then raise exception 'Duplicate SO created';end if;
 if (select to_jsonb(q) from public.quotations q where q.id=s.quotation_id) is distinct from old_quote then raise exception 'Source quotation changed';end if;
 if not exists(select 1 from public.crm_so_approvals where sales_order_id=s.id and status='pending' and requested_by=s.owner_id and signature_storage_key is null) then raise exception 'Reapproval not requested or prior signature retained';end if;
 if not exists(select 1 from public.crm_so_amendments where id=a.id and status='applied') then raise exception 'Scope not consumed';end if;
 perform public.crm_save_so_amendment(a.id,revised.updated_at,patch);
 raise notice 'PASS owner conversion preserves SO identity, requires reapproval, rejects stale edits and reviewer edits';
end $test$;
rollback;
