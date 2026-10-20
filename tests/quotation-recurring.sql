begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where is_super_admin and is_active limit 1),true);
set local role authenticated;
do $$
declare cid uuid;q public.quotations;f public.crm_quotation_financials;test_items jsonb;
begin
 select id into cid from public.customers limit 1;
 test_items:='[{"name":"Daily","qty":1,"price":300,"cost":100,"billing_period":"day","cycle_count":30,"service_start":"2026-11-01"},{"name":"Monthly","qty":10,"price":500,"cost":200,"billing_period":"month","cycle_count":12,"service_start":"2026-11-01"},{"name":"Yearly","qty":1,"price":12000,"cost":6000,"billing_period":"year","cycle_count":1,"service_start":"2026-11-01"}]';
 insert into public.quotations(customer_id,owner_id,issue_date,valid_until,status,tax_rate,wht_rate,document_discount,items,quotation_kind,recurring)
 values(cid,auth.uid(),current_date,current_date+30,'draft',7,0,0,test_items,'recurring','{"start_date":"2026-11-01","end_date":"2027-10-31","billing_timing":"advance"}') returning * into q;
 if q.total<>86670 or q.subtotal<>81000 or q.items->1->>'service_end'<>'2027-10-31' then raise exception 'Mixed recurring totals/date failed';end if;
 select * into f from public.crm_quotation_financials where quotation_id=q.id;
 if f.cost_total<>33000 or f.gp_amount<>48000 then raise exception 'Recurring financials failed';end if;
 if q.items->0?'cost' then raise exception 'Cost leaked';end if;
 update public.quotations set items=test_items where id=q.id returning * into q;
 if q.total<>86670 then raise exception 'Repeat save changed amount';end if;
 begin
  update public.quotations set recurring=jsonb_set(recurring,'{end_date}','"2027-10-30"') where id=q.id;
  raise exception 'TEST accepted invalid period';
 exception when others then if sqlerrm='TEST accepted invalid period' then raise;end if;end;
 begin
  update public.quotations set items=jsonb_set(items,'{0,cycle_count}','0') where id=q.id;
  raise exception 'TEST accepted zero cycles';
 exception when others then if sqlerrm='TEST accepted zero cycles' then raise;end if;end;
 update public.quotations set quotation_kind='standard',items='[{"name":"Standard","qty":2,"price":100,"cost":60}]' where id=q.id returning * into q;
 if q.total<>214 or q.recurring<>'{}' then raise exception 'Standard regression';end if;
end $$;
rollback;
