ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mailing_street_th text, ADD COLUMN IF NOT EXISTS mailing_street_en text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS mailing_street_th text, ADD COLUMN IF NOT EXISTS mailing_street_en text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_th text, ADD COLUMN IF NOT EXISTS address_en text, ADD COLUMN IF NOT EXISTS shipping_street_th text, ADD COLUMN IF NOT EXISTS shipping_street_en text;
CREATE OR REPLACE FUNCTION public.crm_convert_lead(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE src public.leads; cid uuid; person_id uuid; account_name text;
BEGIN
 IF NOT(private.crm_can('leads','view') AND private.crm_can('leads','edit') AND private.crm_can('customers','create')) THEN RAISE EXCEPTION 'Lead conversion permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO src FROM public.leads WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
 IF src.status='converted' THEN
  IF src.customer_id IS NULL THEN RAISE EXCEPTION 'Converted lead has no linked customer'; END IF;
  RETURN src.customer_id;
 END IF;
 IF src.lead_type='Individual' THEN src.company_name:=nullif(trim(src.contact_name),''); END IF; IF coalesce(length(trim(src.company_name)),0)=0 THEN RAISE EXCEPTION 'Company name required'; END IF;
 cid:=src.customer_id;
 IF cid IS NULL THEN
  INSERT INTO public.customers(name,type,tax_id,phone,email,website,address,address_th,address_en,billing_city,province,billing_postal_code,billing_country,owner_id,owner_name,status)
  VALUES(src.company_name,src.lead_type,src.tax_id,src.phone,src.email,src.website,src.mailing_street,src.mailing_street_th,src.mailing_street_en,src.mailing_city,src.mailing_state,src.mailing_postal_code,src.mailing_country,src.owner_id,src.owner_name,'Active') RETURNING id INTO cid;
 END IF;
 SELECT name INTO account_name FROM public.customers WHERE id=cid;
 IF account_name IS NULL THEN RAISE EXCEPTION 'Account not found or access denied'; END IF;
 IF length(trim(coalesce(src.contact_name,'')))>0 THEN
  IF NOT private.crm_can('contacts','create') THEN RAISE EXCEPTION 'Contact creation permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.contacts(name,salutation,first_name,last_name,customer_id,company,phone,mobile,email,line_id,position,description,mailing_country,mailing_street,mailing_street_th,mailing_street_en,mailing_city,mailing_state,mailing_postal_code,owner_id,owner_name,status,is_primary)
  VALUES(src.contact_name,src.salutation,src.first_name,src.last_name,cid,account_name,src.phone,src.mobile,src.email,src.line_id,src.position,src.note,src.mailing_country,src.mailing_street,src.mailing_street_th,src.mailing_street_en,src.mailing_city,src.mailing_state,src.mailing_postal_code,src.owner_id,src.owner_name,'active',true) RETURNING id INTO person_id;
 END IF;
 UPDATE public.leads SET status='converted',customer_id=cid,converted_contact_id=person_id,converted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO public.audit_logs(user_id,action,module,record_id,changes) VALUES(auth.uid(),'update','leads',p_id,jsonb_build_object('converted_customer_id',cid,'converted_contact_id',person_id));
 RETURN cid;
END $function$
;


CREATE OR REPLACE FUNCTION public.crm_create_customer_with_contact(p_customer jsonb, p_contact jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare account public.customers; first_name text := trim(coalesce(p_contact->>'first_name','')); last_name text := trim(coalesce(p_contact->>'last_name',''));
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not private.crm_can('customers','create') or not private.crm_can('contacts','create') then raise exception 'ไม่มีสิทธิ์สร้างลูกค้าหรือผู้ติดต่อ / Customer and contact create permissions required' using errcode='42501'; end if;
 if coalesce(trim(p_customer->>'name'),'')='' or first_name='' or last_name='' then raise exception 'Customer name and contact first/last name are required'; end if;
 if exists(select 1 from jsonb_each_text(p_contact) v where length(v.value)>250) then raise exception 'Contact fields must be at most 250 characters'; end if;
 insert into public.customers (name,name_en,type,industry,tier,tax_id,phone,email,website,description,parent_customer_id,address,address_th,address_en,billing_country,billing_city,province,billing_postal_code,shipping_country,shipping_street,shipping_street_th,shipping_street_en,shipping_city,shipping_state,shipping_postal_code,status,owner_id,owner_name) values (p_customer->>'name',p_customer->>'name_en',p_customer->>'type',p_customer->>'industry',p_customer->>'tier',nullif(p_customer->>'tax_id','')::uuid,p_customer->>'phone',p_customer->>'email',p_customer->>'website',p_customer->>'description',nullif(p_customer->>'parent_customer_id','')::uuid,p_customer->>'address',p_customer->>'address_th',p_customer->>'address_en',p_customer->>'billing_country',p_customer->>'billing_city',p_customer->>'province',p_customer->>'billing_postal_code',p_customer->>'shipping_country',p_customer->>'shipping_street',p_customer->>'shipping_street_th',p_customer->>'shipping_street_en',p_customer->>'shipping_city',p_customer->>'shipping_state',p_customer->>'shipping_postal_code',p_customer->>'status',nullif(p_customer->>'owner_id','')::uuid,p_customer->>'owner_name') returning * into account;
 insert into public.contacts (name,first_name,last_name,position,phone,email,customer_id,company,owner_id,owner_name,is_primary,status)
 values (first_name||' '||last_name,first_name,last_name,trim(p_contact->>'position'),trim(p_contact->>'phone'),trim(p_contact->>'email'),account.id,account.name,account.owner_id,account.owner_name,true,'active');
 return to_jsonb(account);
end;
$function$

;
NOTIFY pgrst,'reload schema';
