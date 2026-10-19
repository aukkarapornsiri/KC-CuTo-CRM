CREATE OR REPLACE FUNCTION private.crm_quote_financial_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_can('quotations','view') AND (private.crm_can('quotations','approve') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (CASE WHEN p.role='custom' THEN p.custom_role_key ELSE p.role END) IN ('sales_user','sales_coordinator','sales_manager','sales_director')))
$$;
REVOKE ALL ON FUNCTION private.crm_quote_financial_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.crm_quote_financial_access() TO authenticated;
ALTER POLICY crm_quotation_financials_read ON public.crm_quotation_financials USING (private.crm_quote_financial_access() AND EXISTS(SELECT 1 FROM public.quotations q WHERE q.id=quotation_id));
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('private.crm_price_catalog_secure()'::regprocedure) INTO def;
 def:=replace(def,'private.crm_can(''quotations'',''approve'')','private.crm_quote_financial_access()'); EXECUTE def;
 SELECT pg_get_functiondef('public.crm_quotation_financial_summary(uuid)'::regprocedure) INTO def;
 def:=replace(def,'private.crm_can(''quotations'',''approve'')','private.crm_quote_financial_access()');
 def:=replace(def,'Quotation approval permission required','Quotation financial access required'); EXECUTE def;
END $$;
NOTIFY pgrst,'reload schema';
