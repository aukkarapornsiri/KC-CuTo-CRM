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
  INSERT INTO public.customers(name,type,tax_id,phone,email,website,address,billing_city,province,billing_postal_code,billing_country,owner_id,owner_name,status)
  VALUES(src.company_name,src.lead_type,src.tax_id,src.phone,src.email,src.website,src.mailing_street,src.mailing_city,src.mailing_state,src.mailing_postal_code,src.mailing_country,src.owner_id,src.owner_name,'Active') RETURNING id INTO cid;
 END IF;
 SELECT name INTO account_name FROM public.customers WHERE id=cid;
 IF account_name IS NULL THEN RAISE EXCEPTION 'Account not found or access denied'; END IF;
 IF length(trim(coalesce(src.contact_name,'')))>0 THEN
  IF NOT private.crm_can('contacts','create') THEN RAISE EXCEPTION 'Contact creation permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.contacts(name,salutation,first_name,last_name,customer_id,company,phone,mobile,email,line_id,position,description,mailing_country,mailing_street,mailing_city,mailing_state,mailing_postal_code,owner_id,owner_name,status,is_primary)
  VALUES(src.contact_name,src.salutation,src.first_name,src.last_name,cid,account_name,src.phone,src.mobile,src.email,src.line_id,src.position,src.note,src.mailing_country,src.mailing_street,src.mailing_city,src.mailing_state,src.mailing_postal_code,src.owner_id,src.owner_name,'active',true) RETURNING id INTO person_id;
 END IF;
 UPDATE public.leads SET status='converted',customer_id=cid,converted_contact_id=person_id,converted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO public.audit_logs(user_id,action,module,record_id,changes) VALUES(auth.uid(),'update','leads',p_id,jsonb_build_object('converted_customer_id',cid,'converted_contact_id',person_id));
 RETURN cid;
END $function$
;

-- Fill an absent billing address when a converted lead receives its address later.
-- Invoker security preserves customer UPDATE RLS; established billing addresses are untouched.
create or replace function private.crm_fill_customer_address_from_lead()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='converted' and new.customer_id is not null
    and nullif(btrim(new.mailing_street),'') is not null then
  update public.customers c
  set address=new.mailing_street,billing_city=new.mailing_city,province=new.mailing_state,
      billing_postal_code=new.mailing_postal_code,billing_country=new.mailing_country,
      updated_at=clock_timestamp()
  where c.id=new.customer_id
    and (nullif(btrim(c.address),'') is null
         or lower(btrim(c.address)) in ('thailand','ไทย','ประเทศไทย',lower(btrim(new.mailing_country))))
    and nullif(btrim(c.billing_city),'') is null
    and nullif(btrim(c.province),'') is null
    and nullif(btrim(c.billing_postal_code),'') is null;
 end if;
 return new;
end $$;
revoke all on function private.crm_fill_customer_address_from_lead() from public,anon,authenticated;
create trigger crm_fill_customer_address_from_lead
after insert or update of customer_id,status,mailing_street,mailing_city,mailing_state,mailing_postal_code,mailing_country
on public.leads for each row execute function private.crm_fill_customer_address_from_lead();
