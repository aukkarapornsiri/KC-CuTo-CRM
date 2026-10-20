DO $patch$ DECLARE def text; needle text:='clean:=clean||jsonb_build_array'; BEGIN
 SELECT pg_get_functiondef('private.crm_quote_totals()'::regprocedure) INTO def;
 IF position(needle in def)=0 THEN RAISE EXCEPTION 'Quotation snapshot insertion point missing'; END IF;
 def:=replace(def,needle,$inject$
 if price_id is not null and nullif(item->>'part_number','') is null then
  item:=item||jsonb_build_object('part_number',coalesce((select p.product_details->>'part_number' from public.crm_price_items p where p.id=price_id),''));
 end if;
 clean:=clean||jsonb_build_array$inject$);
 EXECUTE def;
END $patch$;
