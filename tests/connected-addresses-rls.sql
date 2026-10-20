BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.profiles WHERE role='admin' AND is_active LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE lid uuid; cid uuid; person uuid; qid uuid; custom_id uuid; frozen_id uuid; foreign_id uuid; c public.customers;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Active admin required'; END IF;
 INSERT INTO public.leads(company_name,first_name,last_name,status,owner_id,mailing_street,mailing_city,mailing_state,mailing_postal_code,mailing_country)
 VALUES('Address regression','Address','Test','new',auth.uid(),'1 Street','District','Bangkok','10100','Thailand') RETURNING id INTO lid;
 cid:=public.crm_convert_lead(lid);
 SELECT converted_contact_id INTO person FROM public.leads WHERE id=lid;
 INSERT INTO public.quotations(customer_id,owner_id,status,items,address_source)
 VALUES(cid,auth.uid(),'draft','[{"name":"QA","qty":1,"price":100,"cost":10}]','customer') RETURNING id INTO qid;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=qid)<>'1 Street, District, Bangkok, 10100, Thailand' THEN RAISE EXCEPTION 'New quotation did not use full billing address'; END IF;
 INSERT INTO public.quotations(customer_id,owner_id,status,items,address_source,counterparty_address)
 VALUES(cid,auth.uid(),'draft','[{"name":"QA","qty":1,"price":100,"cost":10}]','custom','Branch office') RETURNING id INTO custom_id;
 INSERT INTO public.quotations(customer_id,owner_id,status,items,address_source)
 VALUES(cid,auth.uid(),'draft','[{"name":"QA","qty":1,"price":100,"cost":10}]','customer') RETURNING id INTO frozen_id;
 UPDATE public.quotations SET status='submitted' WHERE id=frozen_id;
 INSERT INTO public.contacts(name,first_name,last_name,customer_id,mailing_street,mailing_country)
 VALUES('Branch Contact','Branch','Contact',cid,'Different office','Thailand') RETURNING id INTO foreign_id;
 UPDATE public.leads SET mailing_street='2 Street',mailing_postal_code='10200' WHERE id=lid;
 SELECT * INTO c FROM public.customers WHERE id=cid;
 IF c.address<>'2 Street' OR c.billing_postal_code<>'10200' THEN RAISE EXCEPTION 'Lead edit did not reach master'; END IF;
 IF (SELECT mailing_street FROM public.contacts WHERE id=person)<>'2 Street' THEN RAISE EXCEPTION 'Converted contact stale'; END IF;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=qid)<>private.crm_billing_text(c) THEN RAISE EXCEPTION 'Draft stale after lead edit'; END IF;
 UPDATE public.customers SET address='3 Street' WHERE id=cid;
 IF (SELECT mailing_street FROM public.leads WHERE id=lid)<>'3 Street' THEN RAISE EXCEPTION 'Master edit did not reach linked lead'; END IF;
 IF (SELECT mailing_street FROM public.contacts WHERE id=person)<>'3 Street' THEN RAISE EXCEPTION 'Master edit did not reach contact'; END IF;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=custom_id)<>'Branch office' THEN RAISE EXCEPTION 'Custom address overwritten'; END IF;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=frozen_id)<>'1 Street, District, Bangkok, 10100, Thailand' THEN RAISE EXCEPTION 'Issued snapshot overwritten'; END IF;
 IF (SELECT mailing_street FROM public.contacts WHERE id=foreign_id)<>'Different office' THEN RAISE EXCEPTION 'Separate contact address overwritten'; END IF;
 UPDATE public.quotations SET counterparty_address='Manually edited' WHERE id=qid;
 IF (SELECT address_source FROM public.quotations WHERE id=qid)<>'custom' THEN RAISE EXCEPTION 'Old client custom edit not preserved'; END IF;
 UPDATE public.customers SET address='4 Street' WHERE id=cid;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=qid)<>'Manually edited' THEN RAISE EXCEPTION 'Manual address overwritten later'; END IF;
 UPDATE public.quotations SET address_source='customer' WHERE id=qid;
 IF (SELECT counterparty_address FROM public.quotations WHERE id=qid)<>'4 Street, District, Bangkok, 10200, Thailand' THEN RAISE EXCEPTION 'Reconnect failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: conversion, lead/master/contact/draft propagation, custom addresses, issued snapshots, reconnect; fixtures rolled back' result;
